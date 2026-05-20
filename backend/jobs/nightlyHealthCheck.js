const mongoose = require('mongoose');
const stripe = require('../config/stripe');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const pushNotifications = require('../services/pushNotifications');
const logger = require('../config/logger');

async function runNightlyHealthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: [],
    alerts: [],
  };

  try {
    await checkDatabaseHealth(results);
    await checkStripeConnectivity(results);
    await checkStalePendingTransactions(results);
    await checkSuspendedCards(results);
    await checkOrphanedCards(results);
    await checkHighValueTransactions(results);

    results.status = results.alerts.length === 0 ? 'healthy' : 'degraded';
    logger.info({ msg: 'Nightly health check complete', results });

    if (results.alerts.length > 0) {
      await notifyAdmins(results.alerts);
    }
  } catch (err) {
    logger.error({ msg: 'Nightly health check failed', err });
    results.status = 'error';
    results.error = err.message;
  }

  return results;
}

async function checkDatabaseHealth(results) {
  const state = mongoose.connection.readyState;
  const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const status = stateMap[state] || 'unknown';
  const ok = state === 1;

  results.checks.push({ name: 'database', status: ok ? 'ok' : 'fail', detail: status });
  if (!ok) results.alerts.push(`Database not connected: ${status}`);
}

async function checkStripeConnectivity(results) {
  try {
    await stripe.balance.retrieve();
    results.checks.push({ name: 'stripe', status: 'ok' });
  } catch (err) {
    results.checks.push({ name: 'stripe', status: 'fail', detail: err.message });
    results.alerts.push(`Stripe connectivity issue: ${err.message}`);
  }
}

async function checkStalePendingTransactions(results) {
  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const staleCount = await Transaction.countDocuments({
    status: 'authorized',
    authorizedAt: { $lt: staleThreshold },
  });

  const ok = staleCount === 0;
  results.checks.push({ name: 'stale_transactions', status: ok ? 'ok' : 'warn', count: staleCount });
  if (!ok) results.alerts.push(`${staleCount} transactions pending >48h`);
}

async function checkSuspendedCards(results) {
  const frozenCount = await Card.countDocuments({ status: 'frozen' });
  results.checks.push({ name: 'frozen_cards', status: 'ok', count: frozenCount });

  if (frozenCount > 50) {
    results.alerts.push(`Unusual number of frozen cards: ${frozenCount}`);
  }
}

async function checkOrphanedCards(results) {
  // Cards whose Stripe ID doesn't match a known active cardholder
  const cards = await Card.find({ status: 'active' }).limit(100);
  let orphaned = 0;

  for (const card of cards) {
    try {
      await stripe.issuing.cards.retrieve(card.stripeCardId);
    } catch (err) {
      if (err.code === 'resource_missing') {
        orphaned++;
        logger.warn({ msg: 'Orphaned card detected', cardId: card._id, stripeCardId: card.stripeCardId });
      }
    }
  }

  const ok = orphaned === 0;
  results.checks.push({ name: 'orphaned_cards', status: ok ? 'ok' : 'fail', count: orphaned });
  if (!ok) results.alerts.push(`${orphaned} orphaned card(s) detected`);
}

async function checkHighValueTransactions(results) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threshold = 5000 * 100; // $5,000 in cents

  const highValueCount = await Transaction.countDocuments({
    createdAt: { $gte: yesterday },
    amount: { $gte: threshold },
  });

  results.checks.push({ name: 'high_value_transactions', status: 'ok', count: highValueCount });
  if (highValueCount > 10) {
    results.alerts.push(`${highValueCount} high-value transactions (>$5k) in past 24h — review for fraud`);
  }
}

async function notifyAdmins(alerts) {
  const admins = await User.find({ role: 'admin', isActive: true });
  const message = `Health check found ${alerts.length} issue(s): ${alerts[0]}${alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ''}`;
  await pushNotifications.sendHealthAlertNotification(admins, message);
}

module.exports = { runNightlyHealthCheck };
