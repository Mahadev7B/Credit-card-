const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');
const User = require('../models/User');
const Card = require('../models/Card');
const stripeIssuingService = require('../services/stripeIssuing');
const logger = require('../config/logger');

router.use(authenticate);

router.post('/linked-cards', async (req, res, next) => {
  try {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ error: 'cardId required' });

    const cardEntry = CARD_REWARDS_DB.find(c => c.id === cardId);
    if (!cardEntry) return res.status(404).json({ error: 'Card not found' });
    if (cardEntry.isOwnCard) return res.status(400).json({ error: 'SmartCard is automatically included' });

    const user = await User.findById(req.user._id);
    if (user.linkedCards.some(c => c.cardId === cardId)) {
      return res.status(409).json({ error: 'Card already linked' });
    }

    const isFirstCard = user.linkedCards.length === 0;
    user.linkedCards.push({ cardId });
    await user.save();

    // Auto-issue a SmartCard when user links their first existing card
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

router.delete('/linked-cards/:cardId', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const before = user.linkedCards.length;
    user.linkedCards = user.linkedCards.filter(c => c.cardId !== req.params.cardId);
    if (user.linkedCards.length === before) {
      return res.status(404).json({ error: 'Card not linked' });
    }
    await user.save();
    res.json({ linkedCards: user.linkedCards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
