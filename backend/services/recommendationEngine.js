const { CARD_REWARDS_DB, getCategoryFromMCC, getCardById } = require('../data/cardRewardsDB');

// userCards: array of { cardDbId, nickname, last4 } — the user's linked cards
// mccCode or category: merchant info
// Returns ranked list of recommendations
function recommendCard({ userCardIds = [], mccCode, category, merchantName }) {
  const resolvedCategory = category || getCategoryFromMCC(mccCode) || 'general';

  // Always include our own card as a fallback
  const ownCard = CARD_REWARDS_DB.find(c => c.isOwnCard);
  const candidateIds = new Set([...userCardIds, ownCard?.id].filter(Boolean));

  const ranked = [];
  for (const cardId of candidateIds) {
    const dbCard = getCardById(cardId);
    if (!dbCard) continue;
    const rate = dbCard.rates[resolvedCategory] ?? dbCard.rates.general ?? 0;
    ranked.push({
      cardId: dbCard.id,
      cardName: dbCard.name,
      issuer: dbCard.issuer,
      network: dbCard.network,
      annualFee: dbCard.annualFee,
      isOwnCard: dbCard.isOwnCard || false,
      category: resolvedCategory,
      cashbackRate: rate,
      cashbackPercent: `${(rate * 100).toFixed(1)}%`,
      notes: dbCard.notes,
    });
  }

  ranked.sort((a, b) => b.cashbackRate - a.cashbackRate);

  return {
    merchant: merchantName || null,
    category: resolvedCategory,
    recommendation: ranked[0] || null,
    allOptions: ranked,
  };
}

// For a given category, return the best card from the full DB (used for onboarding tips)
function bestCardForCategory(category) {
  const candidates = CARD_REWARDS_DB.map(c => ({
    cardId: c.id,
    cardName: c.name,
    issuer: c.issuer,
    cashbackRate: c.rates[category] ?? c.rates.general ?? 0,
    annualFee: c.annualFee,
  }));
  candidates.sort((a, b) => b.cashbackRate - a.cashbackRate);
  return candidates.slice(0, 3);
}

module.exports = { recommendCard, bestCardForCategory };
