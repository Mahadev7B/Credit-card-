const router = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');

router.use(authenticate);
router.use(requireRole('admin'));

// GET /api/admin/stats — dashboard summary
router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalCards, totalTx, activeToday] = await Promise.all([
      User.countDocuments(),
      Card.countDocuments({ status: { $ne: 'canceled' } }),
      Transaction.countDocuments(),
      User.countDocuments({ lastLoginAt: { $gte: new Date(Date.now() - 86400000) } }),
    ]);
    res.json({ totalUsers, totalCards, totalTx, activeToday });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users — paginated user list
router.get('/users', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const query = search
      ? { $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
        ] }
      : {};

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('email firstName lastName phone createdAt lastLoginAt isActive kycStatus rewardsBalance totalCashback stripeCardholderId linkedCards'),
      User.countDocuments(query),
    ]);

    // Enrich with card counts
    const userIds = users.map(u => u._id);
    const cardCounts = await Card.aggregate([
      { $match: { userId: { $in: userIds }, status: { $ne: 'canceled' } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, types: { $addToSet: '$type' } } },
    ]);
    const cardMap = {};
    cardCounts.forEach(c => { cardMap[c._id.toString()] = c; });

    const enriched = users.map(u => ({
      ...u.toObject(),
      smartCardCount: cardMap[u._id.toString()]?.count || 0,
      hasPhysical: cardMap[u._id.toString()]?.types?.includes('physical') || false,
      linkedCardCount: u.linkedCards?.length || 0,
    }));

    res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:userId — single user detail
router.get('/users/:userId', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [cards, txCount] = await Promise.all([
      Card.find({ userId: user._id }).sort({ createdAt: -1 }),
      Transaction.countDocuments({ userId: user._id }),
    ]);

    res.json({ user, cards, txCount });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:userId — toggle active, change role
router.patch('/users/:userId', async (req, res, next) => {
  try {
    const { isActive, role, kycStatus } = req.body;
    const update = {};
    if (typeof isActive === 'boolean') update.isActive = isActive;
    if (role && ['user', 'admin'].includes(role)) update.role = role;
    if (kycStatus && ['pending', 'approved', 'rejected'].includes(kycStatus)) update.kycStatus = kycStatus;

    const user = await User.findByIdAndUpdate(req.params.userId, update, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
