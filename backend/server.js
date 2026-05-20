require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const webhookRoutes = require('./routes/webhooks');
const statementRoutes = require('./routes/statements');
const rewardsRoutes = require('./routes/rewards');
const { runNightlyHealthCheck } = require('./jobs/nightlyHealthCheck');

const app = express();

// Webhook route must use raw body before JSON parsing
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '10kb' }));

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

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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

async function start() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smartcard');
  logger.info('Connected to MongoDB');

  const port = process.env.PORT || 3000;
  app.listen(port, () => logger.info(`Server running on port ${port}`));
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

module.exports = app;
