const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const stripeIssuingService = require('../services/stripeIssuing');
const { authenticate } = require('../middleware/auth');
const logger = require('../config/logger');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const existing = await User.findOne({ email: value.email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const user = new User({
      email: value.email,
      passwordHash: value.password,
      firstName: value.firstName,
      lastName: value.lastName,
      phone: value.phone,
    });

    // Create Stripe customer and cardholder
    const { customerId, cardholderId } = await stripeIssuingService.createCardholder({
      email: value.email,
      firstName: value.firstName,
      lastName: value.lastName,
      phone: value.phone,
    });

    user.stripeCustomerId = customerId;
    user.stripeCardholderId = cardholderId;

    await user.save();
    logger.info({ msg: 'User registered', userId: user._id });

    const token = signToken(user._id);
    res.status(201).json({ token, user: { id: user._id, email: user.email, firstName: user.firstName } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const user = await User.findOne({ email: value.email }).select('+passwordHash');
    if (!user || !(await user.verifyPassword(value.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) return res.status(403).json({ error: 'Account suspended' });

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user._id);
    logger.info({ msg: 'User logged in', userId: user._id });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        rewardsBalance: user.rewardsBalance,
        kycStatus: user.kycStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/refresh', authenticate, (req, res) => {
  const token = signToken(req.user._id);
  res.json({ token });
});

router.post('/push-token', authenticate, async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token || !platform) return res.status(400).json({ error: 'token and platform required' });

    const user = req.user;
    const exists = user.pushTokens.some((t) => t.token === token);
    if (!exists) {
      user.pushTokens.push({ token, platform, createdAt: new Date() });
      await user.save();
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
