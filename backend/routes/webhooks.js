const router = require('express').Router();
const stripe = require('../config/stripe');
const rewardsRouter = require('../services/rewardsRouter');
const fallbackLogic = require('../services/fallbackLogic');
const pushNotifications = require('../services/pushNotifications');
const { findBestRoutingCard } = require('../services/routingEngine');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../config/logger');

// Stripe sends raw body — verify signature before processing
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ msg: 'Webhook signature verification failed', err: err.message });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  logger.info({ msg: 'Stripe webhook received', type: event.type, id: event.id });

  try {
    await routeEvent(event);
    res.json({ received: true });
  } catch (err) {
    logger.error({ msg: 'Webhook processing error', type: event.type, err });
    // Return 200 to prevent Stripe from retrying — log and investigate separately
    res.json({ received: true, warning: 'Processing error logged' });
  }
});

async function routeEvent(event) {
  switch (event.type) {
    case 'issuing_authorization.request':
      await handleAuthorizationRequest(event.data.object);
      break;
    case 'issuing_authorization.created':
      await handleAuthorizationCreated(event.data.object);
      break;
    case 'issuing_transaction.created':
      await handleTransactionCreated(event.data.object);
      break;
    case 'issuing_card.created':
      logger.info({ msg: 'Issuing card created', cardId: event.data.object.id });
      break;
    case 'issuing_cardholder.updated':
      await handleCardholderUpdated(event.data.object);
      break;
    default:
      logger.debug({ msg: 'Unhandled webhook event', type: event.type });
  }
}

async function handleAuthorizationRequest(authorization) {
  const card = await Card.findOne({ stripeCardId: authorization.card.id });
  if (!card) {
    logger.warn({ msg: 'Authorization for unknown card', stripeCardId: authorization.card.id });
    await stripe.issuing.authorizations.decline(authorization.id);
    return;
  }

  const approved = await fallbackLogic.evaluateAuthorization({
    authorization,
    card,
    amount: authorization.pending_request.amount,
    merchantData: authorization.merchant_data,
  });

  if (approved) {
    await stripe.issuing.authorizations.approve(authorization.id);
  } else {
    await stripe.issuing.authorizations.decline(authorization.id);
  }
}

async function handleAuthorizationCreated(authorization) {
  const card = await Card.findOne({ stripeCardId: authorization.card.id });
  if (!card) return;

  const mcc = authorization.merchant_data?.category_code;
  const rewardsData = await rewardsRouter.calculateRewards({
    card,
    amount: authorization.amount,
    mccCode: mcc,
    merchantName: authorization.merchant_data?.name,
  });

  const tx = await Transaction.create({
    userId: card.userId,
    cardId: card._id,
    stripeAuthorizationId: authorization.id,
    amount: authorization.amount,
    currency: authorization.currency,
    merchantName: authorization.merchant_data?.name,
    merchantCategory: authorization.merchant_data?.category,
    mccCode: mcc,
    status: authorization.status === 'closed' ? 'declined' : 'authorized',
    cashbackAmount: rewardsData.cashbackAmount,
    cashbackRate: rewardsData.cashbackRate,
    rewardCategory: rewardsData.category,
    authorizedAt: new Date(authorization.created * 1000),
  });

  // Notify user
  const user = await User.findById(card.userId);
  if (user) {
    await pushNotifications.sendTransactionNotification(user, tx);
  }
}

async function handleTransactionCreated(transaction) {
  const existingTx = await Transaction.findOne({
    stripeAuthorizationId: transaction.authorization,
  });

  if (!existingTx) return;

  existingTx.stripeTransactionId = transaction.id;
  existingTx.status = 'captured';
  existingTx.capturedAt = new Date(transaction.created * 1000);
  await existingTx.save();

  // Apply SmartCard cashback to user balance
  if (existingTx.cashbackAmount > 0) {
    await User.findByIdAndUpdate(existingTx.userId, {
      $inc: {
        rewardsBalance: existingTx.cashbackAmount,
        totalCashback: existingTx.cashbackAmount,
      },
    });
  }

  // Attempt to route to best linked card
  const routingDecision = await findBestRoutingCard({
    userId: existingTx.userId,
    amountCents: existingTx.amount,
    mccCode: existingTx.mccCode,
  });

  if (!routingDecision) return;

  const user = await User.findById(existingTx.userId);
  if (!user || !user.stripeCustomerId) return;

  try {
    const pi = await stripe.paymentIntents.create({
      amount: existingTx.amount,
      currency: (existingTx.currency || 'usd').toLowerCase(),
      customer: user.stripeCustomerId,
      payment_method: routingDecision.routingCard.stripePaymentMethodId,
      confirm: true,
      off_session: true,
      metadata: {
        smartcardTxId: existingTx._id.toString(),
        mccCode: existingTx.mccCode || '',
        merchantName: existingTx.merchantName || '',
        routedCardProductId: routingDecision.routingCard.cardProductId,
      },
    });

    // Deduct routing fee from user's rewards balance
    await User.findByIdAndUpdate(existingTx.userId, {
      $inc: { rewardsBalance: -routingDecision.routingCostDollars },
    });

    existingTx.isRouted = true;
    existingTx.routedToCardId = routingDecision.routingCard._id;
    existingTx.routingPaymentIntentId = pi.id;
    existingTx.routingFeeDollars = routingDecision.routingCostDollars;
    existingTx.estimatedRoutingRewardDollars = routingDecision.estimatedRewardDollars;
    await existingTx.save();

    logger.info({
      msg: 'Transaction routed',
      txId: existingTx._id,
      paymentIntentId: pi.id,
      routingFeeDollars: routingDecision.routingCostDollars,
      estimatedRewardDollars: routingDecision.estimatedRewardDollars,
    });
  } catch (routingErr) {
    // Routing failure is non-fatal — user keeps SmartCard cashback, routing just didn't happen
    logger.error({ msg: 'Routing failed — keeping SmartCard cashback', txId: existingTx._id, err: routingErr });
  }
}

async function handleCardholderUpdated(cardholder) {
  if (cardholder.status === 'blocked') {
    await Card.updateMany(
      { stripeCardholderId: cardholder.id },
      { status: 'frozen' }
    );
    logger.warn({ msg: 'Cardholder blocked, cards frozen', cardholderId: cardholder.id });
  }
}

module.exports = router;
