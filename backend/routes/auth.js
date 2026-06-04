const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Card = require('../models/Card');
const stripe = require('../config/stripe');
const stripeIssuingService = require('../services/stripeIssuing');
const { authenticate } = require('../middleware/auth');
const { sendPasswordReset } = require('../services/mailer');
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
      acceptanceIp: req.ip,
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

          // If terms acceptance is missing, update the cardholder now using login IP/time
          const pastDue = cardholder.requirements?.past_due || [];
          if (pastDue.some(r => r.includes('user_terms_acceptance'))) {
            await stripe.issuing.cardholders.update(user.stripeCardholderId, {
              individual: {
                card_issuing: {
                  user_terms_acceptance: {
                    date: Math.floor(Date.now() / 1000),
                    ip: req.ip || '127.0.0.1',
                  },
                },
              },
            });
            logger.info({ msg: 'Cardholder terms acceptance updated', userId: user._id });
          }

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

// ── Forgot password — always responds with same message to prevent email enumeration ──
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  const GENERIC_OK = { message: 'If that email is registered, you will receive a reset link shortly.' };
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isActive) return res.json(GENERIC_OK);

    // Generate a cryptographically random token; store its SHA-256 hash in DB
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const appUrl = process.env.APP_URL || 'https://georewardsusa.com';
    const resetUrl = `${appUrl}/reset-password.html?token=${rawToken}`;

    await sendPasswordReset(user.email, resetUrl);
    logger.info({ msg: 'Password reset requested', userId: user._id });

    res.json(GENERIC_OK);
  } catch (err) {
    next(err);
  }
});

// ── Reset password ──
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token is required' });
    if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password is required' });
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 10–128 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordHash +passwordResetToken +passwordResetExpires');

    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    user.passwordHash = password; // pre-save hook will hash it
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info({ msg: 'Password reset completed', userId: user._id });
    res.json({ message: 'Password updated. You can now sign in.' });
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
    if (!token || typeof token !== 'string' || token.length > 512) return res.status(400).json({ error: 'Invalid token' });
    if (!['ios', 'android'].includes(platform)) return res.status(400).json({ error: 'platform must be ios or android' });

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
