require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const webhookRoutes = require('./routes/webhooks');
const statementRoutes = require('./routes/statements');
const rewardsRoutes = require('./routes/rewards');
const recommendRoutes = require('./routes/recommend');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const routingCardsRoutes = require('./routes/routingCards');
const { runNightlyHealthCheck } = require('./jobs/nightlyHealthCheck');
const { refreshCardRates } = require('./services/claudeRewardsUpdater');

const app = express();

// Trust Render's reverse proxy so X-Forwarded-For is honored
// for rate limiting and req.ip resolution
app.set('trust proxy', 1);

// Webhook route must use raw body before JSON parsing
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoutes);

// Strict CSP only on /api routes — static HTML pages carry their own CSP meta tags
app.use('/api', helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
// Lighter helmet for static pages (still sets HSTS, X-Frame-Options, etc.)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false,
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '10kb' }));
// Reject requests missing X-Requested-With to block cross-site form submissions
app.use('/api/auth', (req, res, next) => {
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/routing-cards', routingCardsRoutes);

// Expose Stripe publishable key to frontend (safe — publishable key is not secret)
app.get('/api/config', (req, res) => {
  res.json({ stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

app.get('/health', (req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  publicDir,
  publicExists: require('fs').existsSync(publicDir),
}));

// Serve the website (lives in backend/public so it deploys with the backend)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
// Catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method });
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Nightly health check at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('Running nightly health check');
  await runNightlyHealthCheck();
});

// Weekly card rewards refresh every Sunday at 3 AM via Claude API
cron.schedule('0 3 * * 0', async () => {
  logger.info('Running weekly card rewards refresh');
  await refreshCardRates();
});

async function start() {
  const port = process.env.PORT || 3000;

  // Start HTTP server immediately so the web app is reachable even if DB is slow
  app.listen(port, () => logger.info(`Server running on port ${port}`));

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smartcard');
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('MongoDB connection failed — API routes unavailable, static site still up', err);
  }
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

module.exports = app;
