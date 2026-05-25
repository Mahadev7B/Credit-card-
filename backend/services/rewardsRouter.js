const logger = require('../config/logger');

// MCC code to category and cashback rate mapping
const MCC_REWARDS_TABLE = {
  // Dining
  '5812': { category: 'dining', rate: 0.04 },
  '5814': { category: 'dining', rate: 0.04 },
  '5811': { category: 'dining', rate: 0.04 },
  '5813': { category: 'dining', rate: 0.04 },

  // Groceries
  '5411': { category: 'groceries', rate: 0.03 },
  '5422': { category: 'groceries', rate: 0.03 },
  '5441': { category: 'groceries', rate: 0.03 },
  '5451': { category: 'groceries', rate: 0.03 },
  '5462': { category: 'groceries', rate: 0.03 },

  // Gas / EV Charging
  '5541': { category: 'gas', rate: 0.03 },
  '5542': { category: 'gas', rate: 0.03 },
  '5172': { category: 'gas', rate: 0.03 },

  // Travel
  '3000': { category: 'travel', rate: 0.05 },
  '3001': { category: 'travel', rate: 0.05 },
  '4111': { category: 'travel', rate: 0.05 },
  '4112': { category: 'travel', rate: 0.05 },
  '4511': { category: 'travel', rate: 0.05 },
  '7011': { category: 'travel', rate: 0.05 },
  '7512': { category: 'travel', rate: 0.03 },

  // Online Shopping
  '5965': { category: 'online', rate: 0.02 },
  '5999': { category: 'online', rate: 0.02 },

  // Streaming & Subscriptions
  '7372': { category: 'subscriptions', rate: 0.02 },
  '7375': { category: 'subscriptions', rate: 0.02 },

  // Healthcare
  '5912': { category: 'healthcare', rate: 0.02 },
  '8011': { category: 'healthcare', rate: 0.02 },
  '8021': { category: 'healthcare', rate: 0.02 },
  '8099': { category: 'healthcare', rate: 0.02 },
};

const TIER_MULTIPLIERS = {
  standard: 1.0,
  gold: 1.25,
  platinum: 1.5,
};

const DEFAULT_CASHBACK_RATE = 0.01;

async function calculateRewards({ card, amount, mccCode, merchantName }) {
  const amountDollars = amount / 100;

  const mccEntry = mccCode ? MCC_REWARDS_TABLE[mccCode] : null;
  const baseRate = mccEntry ? mccEntry.rate : DEFAULT_CASHBACK_RATE;
  const category = mccEntry ? mccEntry.category : 'general';

  // Apply tier multiplier
  const tierMultiplier = TIER_MULTIPLIERS[card.rewardsTier] || 1.0;
  const effectiveRate = baseRate * tierMultiplier;

  // Check card-level MCC overrides
  const cardOverride = card.mccRewardsConfig?.find((c) => c.mccCode === mccCode);
  const finalRate = cardOverride ? cardOverride.cashbackRate : effectiveRate;

  const cashbackAmount = Math.round(amountDollars * finalRate * 100) / 100;

  logger.info({
    msg: 'Rewards calculated',
    mccCode,
    category,
    baseRate,
    finalRate,
    cashbackAmount,
    merchantName,
  });

  return { cashbackAmount, cashbackRate: finalRate, category };
}

function getMCCRatesTable() {
  const categories = {};
  for (const [mcc, data] of Object.entries(MCC_REWARDS_TABLE)) {
    if (!categories[data.category]) {
      categories[data.category] = { rate: data.rate, mccCodes: [] };
    }
    categories[data.category].mccCodes.push(mcc);
  }
  return {
    categories,
    defaultRate: DEFAULT_CASHBACK_RATE,
    tierMultipliers: TIER_MULTIPLIERS,
  };
}

module.exports = { calculateRewards, getMCCRatesTable };
