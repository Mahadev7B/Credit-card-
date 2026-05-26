const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');
const User = require('../models/User');

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

    user.linkedCards.push({ cardId });
    await user.save();
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
