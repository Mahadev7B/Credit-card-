const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { recommendCard, bestCardForCategory } = require('../services/recommendationEngine');
const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');

router.use(authenticate);

// POST /api/recommend
// Body: { mccCode?, category?, merchantName?, userCardIds?: [cardDbId, ...] }
// Returns best card recommendation from the user's linked cards
router.post('/', (req, res) => {
  const { mccCode, category, merchantName, userCardIds = [] } = req.body;

  if (!mccCode && !category) {
    return res.status(400).json({ error: 'Provide mccCode or category' });
  }

  const result = recommendCard({ userCardIds, mccCode, category, merchantName });
  res.json(result);
});

// GET /api/recommend/categories
// Returns best publicly-known card per category (for onboarding / tips screen)
router.get('/categories', (req, res) => {
  const categories = ['dining', 'groceries', 'travel', 'gas', 'online', 'subscriptions', 'healthcare', 'general'];
  const tips = {};
  for (const cat of categories) {
    tips[cat] = bestCardForCategory(cat);
  }
  res.json({ tips });
});

// GET /api/recommend/cards
// Returns the full card database (so iOS app can let users pick which cards they own)
router.get('/cards', (req, res) => {
  const cards = CARD_REWARDS_DB.map(({ id, name, issuer, network, annualFee, rates, isOwnCard }) => ({
    id, name, issuer, network, annualFee, rates, isOwnCard: isOwnCard || false,
  }));
  res.json({ cards });
});

module.exports = router;
