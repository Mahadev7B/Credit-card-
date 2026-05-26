const router = require('express').Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');
const User = require('../models/User');
const Card = require('../models/Card');
const stripeIssuingService = require('../services/stripeIssuing');
const logger = require('../config/logger');

router.use(authenticate);

const linkedCardSchema = Joi.object({
  cardId: Joi.string().required(),
  nickname: Joi.string().trim().min(1).max(50).required(),
  last4: Joi.string().pattern(/^\d{4}$/).allow('', null),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow('', null),
});

router.post('/linked-cards', async (req, res, next) => {
  try {
    const { error, value } = linkedCardSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const cardEntry = CARD_REWARDS_DB.find(c => c.id === value.cardId);
    if (!cardEntry) return res.status(404).json({ error: 'Card not found in rewards database' });
    if (cardEntry.isOwnCard) return res.status(400).json({ error: 'SmartCard is automatically included' });

    const user = await User.findById(req.user._id);
    const isFirstCard = user.linkedCards.length === 0;

    user.linkedCards.push({
      cardId: value.cardId,
      nickname: value.nickname,
      last4: value.last4 || undefined,
      color: value.color || undefined,
    });
    await user.save();

    // Auto-issue a virtual SmartCard the first time the user links a card
    if (isFirstCard && user.stripeCardholderId) {
      const existing = await Card.findOne({ userId: user._id });
      if (!existing) {
        try {
          const stripeCard = await stripeIssuingService.createCard({
            cardholderId: user.stripeCardholderId,
            type: 'virtual',
          });
          await Card.create({
            userId: user._id,
            stripeCardId: stripeCard.id,
            stripeCardholderId: user.stripeCardholderId,
            last4: stripeCard.last4,
            expMonth: stripeCard.exp_month,
            expYear: stripeCard.exp_year,
            brand: stripeCard.brand,
            type: 'virtual',
            nickname: 'SmartCard',
          });
          logger.info({ msg: 'SmartCard auto-issued on first linked card', userId: user._id });
        } catch (e) {
          logger.warn({ msg: 'SmartCard auto-issue failed (non-fatal)', userId: user._id, err: e.message });
        }
      }
    }

    res.json({ linkedCards: user.linkedCards });
  } catch (err) {
    next(err);
  }
});

// DELETE by subdocument _id (so duplicates of the same product can be removed individually)
router.delete('/linked-cards/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const before = user.linkedCards.length;
    user.linkedCards = user.linkedCards.filter(c => c._id.toString() !== req.params.id);
    if (user.linkedCards.length === before) {
      return res.status(404).json({ error: 'Linked card not found' });
    }
    await user.save();
    res.json({ linkedCards: user.linkedCards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
