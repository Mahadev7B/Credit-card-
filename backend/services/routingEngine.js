const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');
const { MCC_REWARDS_TABLE } = require('./rewardsRouter');
const RoutingCard = require('../models/RoutingCard');
const logger = require('../config/logger');

const SMARTCARD_RATE = 0.015; // 1.5% baseline cashback we give user
const STRIPE_ROUTING_FEE_PCT = 0.029;
const STRIPE_ROUTING_FEE_FIXED = 0.30;

// Amex cards are excluded from routing — Amex prohibits this usage
const EXCLUDED_NETWORKS = ['amex', 'american express'];

function getMccCategory(mccCode) {
  if (!mccCode) return 'general';
  const entry = MCC_REWARDS_TABLE[mccCode];
  return entry ? entry.category : 'general';
}

function getCardRate(cardProductId, category) {
  const card = CARD_REWARDS_DB.find(c => c.id === cardProductId);
  if (!card) return 0;
  return card.rates[category] || card.rates.general || 0;
}

async function findBestRoutingCard({ userId, amountCents, mccCode }) {
  const amountDollars = amountCents / 100;
  const category = getMccCategory(mccCode);
  const routingCost = (STRIPE_ROUTING_FEE_PCT * amountDollars) + STRIPE_ROUTING_FEE_FIXED;

  const routingCards = await RoutingCard.find({ userId, isActive: true });
  if (!routingCards.length) return null;

  let bestCard = null;
  let bestNetBenefit = 0;

  for (const rc of routingCards) {
    // Skip Amex cards — network rules prohibit routing through them
    if (EXCLUDED_NETWORKS.includes((rc.brand || '').toLowerCase())) continue;

    const cardRate = getCardRate(rc.cardProductId, category);
    const routingBenefit = (cardRate - SMARTCARD_RATE) * amountDollars;
    const netBenefit = routingBenefit - routingCost;

    if (netBenefit > bestNetBenefit) {
      bestNetBenefit = netBenefit;
      bestCard = {
        routingCard: rc,
        cardRate,
        category,
        routingCostDollars: routingCost,
        estimatedRewardDollars: cardRate * amountDollars,
        netBenefitDollars: netBenefit,
      };
    }
  }

  if (bestCard) {
    logger.info({
      msg: 'Routing decision: route',
      userId,
      cardProductId: bestCard.routingCard.cardProductId,
      category,
      netBenefit: bestCard.netBenefitDollars,
    });
  } else {
    logger.info({ msg: 'Routing decision: keep on SmartCard', userId, category });
  }

  return bestCard;
}

module.exports = { findBestRoutingCard, getMccCategory };
