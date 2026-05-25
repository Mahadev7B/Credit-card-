const logger = require('../config/logger');

// MCC codes blocked by default for fraud/compliance
const BLOCKED_MCC_CODES = new Set([
  '7995', // Gambling
  '6051', // Quasi-cash
  '6211', // Securities dealers
  '9222', // Government fines
]);

// Velocity thresholds
const VELOCITY_LIMITS = {
  maxTransactionsPerHour: 10,
  maxAmountPerHour: 5000 * 100, // $5,000 in cents
  maxSingleTransaction: 10000 * 100, // $10,000
};

async function evaluateAuthorization({ authorization, card, amount, merchantData }) {
  const reasons = [];

  // 1. Card must be active
  if (card.status !== 'active') {
    logger.info({ msg: 'Auth declined: card not active', cardId: card._id, status: card.status });
    return false;
  }

  // 2. Check blocked MCCs
  const mcc = merchantData?.category_code;
  if (mcc && BLOCKED_MCC_CODES.has(mcc)) {
    logger.info({ msg: 'Auth declined: blocked MCC', mcc, cardId: card._id });
    return false;
  }

  // 3. Single transaction limit
  if (amount > VELOCITY_LIMITS.maxSingleTransaction) {
    logger.info({ msg: 'Auth declined: exceeds single-tx limit', amount, cardId: card._id });
    return false;
  }

  // 4. Card spending limit check (Stripe handles this too but we double-check)
  if (card.spendingLimit) {
    const limitInCents = card.spendingLimit * 100;
    if (amount > limitInCents) {
      logger.info({ msg: 'Auth declined: exceeds card limit', amount, limit: limitInCents });
      return false;
    }
  }

  // 5. Geographic / currency sanity
  if (authorization.currency && authorization.currency !== 'usd' && !card.metadata?.get('allowFX')) {
    logger.info({ msg: 'Auth declined: foreign currency without FX flag', currency: authorization.currency });
    return false;
  }

  if (reasons.length > 0) {
    logger.info({ msg: 'Auth fallback declined', reasons, cardId: card._id });
    return false;
  }

  logger.info({ msg: 'Auth approved via fallback logic', cardId: card._id, amount });
  return true;
}

function categorizeDeclineReason(stripeDeclineCode) {
  const mapping = {
    insufficient_funds: 'Insufficient funds',
    card_velocity_exceeded: 'Spending limit reached',
    suspected_fraud: 'Transaction blocked for security',
    lost_card: 'Card reported lost',
    stolen_card: 'Card reported stolen',
    card_not_active: 'Card is not active',
    do_not_honor: 'Transaction declined by network',
  };
  return mapping[stripeDeclineCode] || 'Transaction declined';
}

module.exports = { evaluateAuthorization, categorizeDeclineReason };
