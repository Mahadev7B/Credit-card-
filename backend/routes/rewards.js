const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const rewardsRouter = require('../services/rewardsRouter');

router.use(authenticate);

router.get('/balance', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('rewardsBalance totalCashback');
    res.json({
      balance: user.rewardsBalance,
      totalEarned: user.totalCashback,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ userId: req.user._id, cashbackAmount: { $gt: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('amount cashbackAmount cashbackRate rewardCategory merchantName createdAt'),
      Transaction.countDocuments({ userId: req.user._id, cashbackAmount: { $gt: 0 } }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/mcc-rates', async (req, res) => {
  res.json({ rates: rewardsRouter.getMCCRatesTable() });
});

module.exports = router;
