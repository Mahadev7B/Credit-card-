const router = require('express').Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const stripeIssuingService = require('../services/stripeIssuing');
const walletProvisioningService = require('../services/walletProvisioning');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const logger = require('../config/logger');

const shippingSchema = Joi.object({
  name: Joi.string().max(100).required(),
  line1: Joi.string().max(200).required(),
  line2: Joi.string().max(200).allow('', null),
  city: Joi.string().max(100).required(),
  state: Joi.string().length(2).uppercase().required(),
  postalCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
  country: Joi.string().length(2).default('US'),
});

const createCardSchema = Joi.object({
  type: Joi.string().valid('virtual', 'physical').default('virtual'),
  nickname: Joi.string().max(50),
  spendingLimit: Joi.number().positive(),
  spendingLimitInterval: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly'),
  shipping: Joi.when('type', { is: 'physical', then: shippingSchema.required(), otherwise: Joi.forbidden() }),
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const cards = await Card.find({ userId: req.user._id, status: { $ne: 'canceled' } })
      .sort({ createdAt: -1 });
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createCardSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    if (!req.user.stripeCardholderId) {
      return res.status(422).json({ error: 'Cardholder profile not set up' });
    }

    const stripeCard = await stripeIssuingService.createCard({
      cardholderId: req.user.stripeCardholderId,
      type: value.type,
      spendingLimit: value.spendingLimit,
      spendingLimitInterval: value.spendingLimitInterval,
      shipping: value.shipping,
    });

    const card = await Card.create({
      userId: req.user._id,
      stripeCardId: stripeCard.id,
      stripeCardholderId: req.user.stripeCardholderId,
      last4: stripeCard.last4,
      expMonth: stripeCard.exp_month,
      expYear: stripeCard.exp_year,
      brand: stripeCard.brand,
      type: value.type,
      nickname: value.nickname,
      spendingLimit: value.spendingLimit,
      spendingLimitInterval: value.spendingLimitInterval,
      shippingAddress: value.shipping,
      shippingStatus: value.type === 'physical' ? 'pending' : undefined,
    });

    logger.info({ msg: 'Card created', cardId: card._id, userId: req.user._id });
    res.status(201).json({ card });
  } catch (err) {
    next(err);
  }
});

router.get('/:cardId', async (req, res, next) => {
  try {
    const card = await Card.findOne({ _id: req.params.cardId, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Fetch sensitive details from Stripe for active cards
    let sensitiveData = null;
    if (card.status === 'active') {
      sensitiveData = await stripeIssuingService.getCardSensitiveData(card.stripeCardId);
    }

    res.json({ card, sensitiveData });
  } catch (err) {
    next(err);
  }
});

router.patch('/:cardId/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive' });
    }

    const card = await Card.findOne({ _id: req.params.cardId, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (card.status === 'canceled') return res.status(422).json({ error: 'Cannot update canceled card' });

    await stripeIssuingService.updateCardStatus(card.stripeCardId, status);
    card.status = status;
    await card.save();

    res.json({ card });
  } catch (err) {
    next(err);
  }
});

router.delete('/:cardId', async (req, res, next) => {
  try {
    const card = await Card.findOne({ _id: req.params.cardId, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    await stripeIssuingService.cancelCard(card.stripeCardId);
    card.status = 'canceled';
    await card.save();

    logger.info({ msg: 'Card canceled', cardId: card._id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:cardId/transactions', async (req, res, next) => {
  try {
    const card = await Card.findOne({ _id: req.params.cardId, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ cardId: card._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments({ cardId: card._id }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.post('/:cardId/wallet/provision', async (req, res, next) => {
  try {
    const card = await Card.findOne({ _id: req.params.cardId, userId: req.user._id });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (card.walletProvisioned) return res.status(409).json({ error: 'Card already in wallet' });

    const { certificates, nonce, nonceSignature } = req.body;
    if (!Array.isArray(certificates) || !certificates.length || typeof nonce !== 'string' || typeof nonceSignature !== 'string') {
      return res.status(400).json({ error: 'Invalid wallet provisioning data' });
    }
    const passData = await walletProvisioningService.provisionAppleWallet({
      card,
      user: req.user,
      certificates,
      nonce,
      nonceSignature,
    });

    card.walletProvisioned = true;
    card.appleWalletPassId = passData.passId;
    await card.save();

    res.json({ passData });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
