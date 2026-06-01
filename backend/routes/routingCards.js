const router = require('express').Router();
const Joi = require('joi');
const stripe = require('../config/stripe');
const { authenticate } = require('../middleware/auth');
const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');
const RoutingCard = require('../models/RoutingCard');
const User = require('../models/User');
const logger = require('../config/logger');

router.use(authenticate);

// Create a SetupIntent so the frontend can securely collect card details
router.post('/setup-intent', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Create Stripe customer if not exists
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user._id.toString() },
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card'],
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    next(err);
  }
});

const addCardSchema = Joi.object({
  paymentMethodId: Joi.string().required(),
  cardProductId: Joi.string().required(),
  nickname: Joi.string().trim().min(1).max(50).required(),
});

// Save confirmed payment method as a routing card
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = addCardSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const cardProduct = CARD_REWARDS_DB.find(c => c.id === value.cardProductId);
    if (!cardProduct) return res.status(400).json({ error: 'Unknown card product' });

    // Block Amex cards from routing
    if (cardProduct.network === 'Amex') {
      return res.status(400).json({ error: 'Amex cards cannot be used for routing due to network rules. You can still add them for recommendations.' });
    }

    const user = await User.findById(req.user._id);

    // Attach payment method to customer
    await stripe.paymentMethods.attach(value.paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // Get card details from Stripe
    const pm = await stripe.paymentMethods.retrieve(value.paymentMethodId);
    const card = pm.card;

    const routingCard = await RoutingCard.create({
      userId: user._id,
      stripePaymentMethodId: value.paymentMethodId,
      cardProductId: value.cardProductId,
      nickname: value.nickname,
      last4: card.last4,
      brand: card.brand,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    });

    logger.info({ msg: 'Routing card added', userId: user._id, cardProductId: value.cardProductId });
    res.json({ routingCard });
  } catch (err) {
    next(err);
  }
});

// List routing cards for current user
router.get('/', async (req, res, next) => {
  try {
    const cards = await RoutingCard.find({ userId: req.user._id, isActive: true });
    res.json({ routingCards: cards });
  } catch (err) {
    next(err);
  }
});

// Remove a routing card
router.delete('/:id', async (req, res, next) => {
  try {
    const card = await RoutingCard.findOne({ _id: req.params.id, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    card.isActive = false;
    await card.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
