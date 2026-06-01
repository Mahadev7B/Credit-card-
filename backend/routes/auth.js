const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Card = require('../models/Card');
const stripe = require('../config/stripe');
const stripeIssuingService = require('../services/stripeIssuing');
const { authenticate } = require('../middleware/auth');
const logger = require('../config/logger');

// Strict rate limits on auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
  skipSuccessfulRequests: true,
});

const COMMON_PASSWORDS = ['password', 'password1', '12345678', 'qwerty123', 'letmein1', 'admin1234'];

const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().min(10).max(128).required()
    .custom((v, helpers) => {
      if (COMMON_PASSWORDS.includes(v.toLowerCase())) return helpers.error('any.invalid');
      if (!/[A-Za-z]/.test(v) || !/[0-9\W]/.test(v)) return helpers.error('any.invalid');
      return v;
    }).messages({ 'any.invalid': 'Password is too weak or too common' }),
  firstName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s'-]+$/).required(),
  lastName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s'-]+$/).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
});

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().max(128).required(),
});

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

router.post('/register', authLimiter, async (req, res, next) => {
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
    if (isAdminEmail(user.email)) user.role = 'admin';

    await user.save();
    logger.info({ msg: 'User registered', userId: user._id });

    const token = signToken(user._id);
    res.status(201).json({ token, user: { id: user._id, email: user.email, firstName: user.firstName } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const user = await User.findOne({ email: value.email }).select('+passwordHash');
    if (!user || !(await user.verifyPassword(value.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) return res.status(403).json({ error: 'Account suspended' });

    // Auto-promote whitelisted emails to admin
    if (isAdminEmail(user.email) && user.role !== 'admin') {
      user.role = 'admin';
      logger.info({ msg: 'Promoted to admin via ADMIN_EMAILS', userId: user._id });
    }

    user.lastLoginAt = new Date();
    await user.save();

    // Sync SmartCard from Stripe on every login — creates DB record if missing
    if (user.stripeCardholderId) {
      try {
        const existing = await Card.findOne({ userId: user._id });
        if (!existing) {
          // Log cardholder requirements so we can see what's blocking card creation
          const cardholder = await stripe.issuing.cardholders.retrieve(user.stripeCardholderId);
          logger.info({ msg: 'Cardholder status', cardholderId: cardholder.id, status: cardholder.status, requirements: cardholder.requirements });

          // Look for an existing card in Stripe for this cardholder
          const stripeCards = await stripe.issuing.cards.list({ cardholder: user.stripeCardholderId, limit: 1 });
          if (stripeCards.data.length > 0) {
            const sc = stripeCards.data[0];
            await Card.create({
              userId: user._id,
              stripeCardId: sc.id,
              stripeCardholderId: user.stripeCardholderId,
              last4: sc.last4,
              expMonth: sc.exp_month,
              expYear: sc.exp_year,
              brand: sc.brand || 'Visa',
              type: sc.type,
              status: sc.status === 'active' ? 'active' : 'inactive',
              nickname: 'SmartCard',
            });
            logger.info({ msg: 'SmartCard synced from Stripe on login', userId: user._id, cardId: sc.id });
          } else {
            // No card in Stripe yet — create one
            const sc = await stripeIssuingService.createCard({ cardholderId: user.stripeCardholderId, type: 'virtual' });
            await Card.create({
              userId: user._id,
              stripeCardId: sc.id,
              stripeCardholderId: user.stripeCardholderId,
              last4: sc.last4,
              expMonth: sc.exp_month,
              expYear: sc.exp_year,
              brand: sc.brand || 'Visa',
              type: 'virtual',
              status: 'active',
              nickname: 'SmartCard',
            });
            logger.info({ msg: 'SmartCard auto-issued on login', userId: user._id, cardId: sc.id });
          }
        }
      } catch (e) {
        logger.warn({ msg: 'SmartCard sync failed on login (non-fatal)', userId: user._id, err: e.message });
      }
    }

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
