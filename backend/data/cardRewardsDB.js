// Top US credit cards with reward rates per merchant category.
// Rates are cashback-equivalent (points converted at typical redemption value).
// Updated via claudeRewardsUpdater.js — do not edit rates manually.

const CARD_REWARDS_DB = [
  {
    id: 'amex-gold',
    name: 'American Express Gold Card',
    issuer: 'American Express',
    network: 'Amex',
    annualFee: 250,
    rates: {
      dining: 0.04,       // 4x points at restaurants
      groceries: 0.04,    // 4x at US supermarkets (up to $25k/yr)
      travel: 0.03,       // 3x on flights booked direct
      gas: 0.01,
      online: 0.01,
      subscriptions: 0.01,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'Groceries capped at $25,000/year; Amex not accepted everywhere',
    lastVerified: '2026-05-01',
  },
  {
    id: 'chase-sapphire-preferred',
    name: 'Chase Sapphire Preferred',
    issuer: 'Chase',
    network: 'Visa',
    annualFee: 95,
    rates: {
      dining: 0.03,       // 3x on dining
      groceries: 0.03,    // 3x online grocery orders (excl warehouse)
      travel: 0.05,       // 5x on Chase Travel portal; 2x general travel
      gas: 0.01,
      online: 0.03,       // 3x on online grocery/select streaming
      subscriptions: 0.03,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'Points worth 1.25x when redeemed via Chase Travel',
    lastVerified: '2026-05-01',
  },
  {
    id: 'chase-sapphire-reserve',
    name: 'Chase Sapphire Reserve',
    issuer: 'Chase',
    network: 'Visa',
    annualFee: 550,
    rates: {
      dining: 0.03,       // 3x dining
      groceries: 0.01,
      travel: 0.10,       // 10x Chase Travel portal; 3x general travel
      gas: 0.01,
      online: 0.01,
      subscriptions: 0.01,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: '$300 annual travel credit offsets fee; points worth 1.5x Chase Travel',
    lastVerified: '2026-05-01',
  },
  {
    id: 'citi-double-cash',
    name: 'Citi Double Cash Card',
    issuer: 'Citi',
    network: 'Mastercard',
    annualFee: 0,
    rates: {
      dining: 0.02,
      groceries: 0.02,
      travel: 0.02,
      gas: 0.02,
      online: 0.02,
      subscriptions: 0.02,
      healthcare: 0.02,
      general: 0.02,       // flat 2% everything (1% purchase + 1% payoff)
    },
    notes: 'Best flat-rate card; no category tracking needed',
    lastVerified: '2026-05-01',
  },
  {
    id: 'amex-blue-cash-preferred',
    name: 'Amex Blue Cash Preferred',
    issuer: 'American Express',
    network: 'Amex',
    annualFee: 95,
    rates: {
      dining: 0.01,
      groceries: 0.06,    // 6% at US supermarkets (up to $6k/yr)
      travel: 0.01,
      gas: 0.03,          // 3% at US gas stations
      online: 0.06,       // 6% on select US streaming services
      subscriptions: 0.06,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'Best grocery card in the US; streaming 6% is excellent',
    lastVerified: '2026-05-01',
  },
  {
    id: 'apple-card',
    name: 'Apple Card',
    issuer: 'Goldman Sachs',
    network: 'Mastercard',
    annualFee: 0,
    rates: {
      dining: 0.02,
      groceries: 0.02,
      travel: 0.02,
      gas: 0.02,
      online: 0.02,
      subscriptions: 0.03, // 3% Apple services, select merchants
      healthcare: 0.02,
      general: 0.01,       // 1% physical card; 2% Apple Pay
    },
    notes: '2% when using Apple Pay; 3% at Apple, Uber, Walgreens, select partners',
    lastVerified: '2026-05-01',
  },
  {
    id: 'discover-it-cash-back',
    name: 'Discover it Cash Back',
    issuer: 'Discover',
    network: 'Discover',
    annualFee: 0,
    rates: {
      dining: 0.01,
      groceries: 0.01,
      travel: 0.01,
      gas: 0.05,          // rotating 5% categories (gas, groceries, restaurants, Amazon)
      online: 0.05,
      subscriptions: 0.01,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'Rotating 5% categories change quarterly; must activate each quarter',
    lastVerified: '2026-05-01',
  },
  {
    id: 'capital-one-venture-x',
    name: 'Capital One Venture X',
    issuer: 'Capital One',
    network: 'Visa',
    annualFee: 395,
    rates: {
      dining: 0.02,
      groceries: 0.02,
      travel: 0.10,       // 10x hotels+cars via C1 Travel; 5x flights; 2x all else
      gas: 0.02,
      online: 0.02,
      subscriptions: 0.02,
      healthcare: 0.02,
      general: 0.02,
    },
    notes: '$300 travel credit + 10k anniversary miles offsets fee for travelers',
    lastVerified: '2026-05-01',
  },
  {
    id: 'wells-fargo-active-cash',
    name: 'Wells Fargo Active Cash',
    issuer: 'Wells Fargo',
    network: 'Visa',
    annualFee: 0,
    rates: {
      dining: 0.02,
      groceries: 0.02,
      travel: 0.02,
      gas: 0.02,
      online: 0.02,
      subscriptions: 0.02,
      healthcare: 0.02,
      general: 0.02,       // flat 2% everything, no annual fee
    },
    notes: 'Best no-fee flat-rate alternative to Citi Double Cash',
    lastVerified: '2026-05-01',
  },
  {
    id: 'chase-freedom-unlimited',
    name: 'Chase Freedom Unlimited',
    issuer: 'Chase',
    network: 'Visa',
    annualFee: 0,
    rates: {
      dining: 0.03,       // 3% dining and drugstores
      groceries: 0.01,
      travel: 0.05,       // 5% Chase Travel portal
      gas: 0.01,
      online: 0.01,
      subscriptions: 0.01,
      healthcare: 0.03,   // 3% drugstores
      general: 0.015,     // 1.5% everything else
    },
    notes: 'No annual fee; pairs well with Sapphire to combine points',
    lastVerified: '2026-05-01',
  },
  {
    id: 'chase-freedom-flex',
    name: 'Chase Freedom Flex',
    issuer: 'Chase',
    network: 'Mastercard',
    annualFee: 0,
    rates: {
      dining: 0.03,
      groceries: 0.05,    // 5% rotating categories
      travel: 0.05,       // 5% Chase Travel
      gas: 0.05,          // when gas is rotating category
      online: 0.05,       // when Amazon/online is rotating
      subscriptions: 0.01,
      healthcare: 0.03,
      general: 0.01,
    },
    notes: 'Rotating 5% categories; must activate quarterly',
    lastVerified: '2026-05-01',
  },
  {
    id: 'amex-platinum',
    name: 'American Express Platinum',
    issuer: 'American Express',
    network: 'Amex',
    annualFee: 695,
    rates: {
      dining: 0.01,
      groceries: 0.01,
      travel: 0.05,       // 5x flights booked direct + Amex Travel
      gas: 0.01,
      online: 0.01,
      subscriptions: 0.01,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'Heavy on perks (lounge access, credits) not cashback; best for frequent flyers',
    lastVerified: '2026-05-01',
  },
  {
    id: 'bank-of-america-premium-rewards',
    name: 'Bank of America Premium Rewards',
    issuer: 'Bank of America',
    network: 'Visa',
    annualFee: 95,
    rates: {
      dining: 0.02,
      groceries: 0.02,
      travel: 0.02,
      gas: 0.015,
      online: 0.015,
      subscriptions: 0.015,
      healthcare: 0.015,
      general: 0.015,
    },
    notes: 'Preferred Rewards members get up to 75% bonus — rates can reach 3.5% travel',
    lastVerified: '2026-05-01',
  },
  {
    id: 'us-bank-altitude-reserve',
    name: 'US Bank Altitude Reserve',
    issuer: 'US Bank',
    network: 'Visa',
    annualFee: 400,
    rates: {
      dining: 0.03,
      groceries: 0.01,
      travel: 0.05,       // 5x on mobile wallet travel + real-time rewards
      gas: 0.01,
      online: 0.01,
      subscriptions: 0.01,
      healthcare: 0.01,
      general: 0.015,
    },
    notes: '3x on mobile wallet purchases (Apple Pay); strong travel rewards',
    lastVerified: '2026-05-01',
  },
  {
    id: 'capital-one-savor',
    name: 'Capital One Savor Cash Rewards',
    issuer: 'Capital One',
    network: 'Mastercard',
    annualFee: 0,
    rates: {
      dining: 0.03,       // 3% dining
      groceries: 0.03,    // 3% grocery stores
      travel: 0.01,
      gas: 0.01,
      online: 0.03,       // 3% entertainment/streaming
      subscriptions: 0.03,
      healthcare: 0.01,
      general: 0.01,
    },
    notes: 'No annual fee; great for dining + entertainment combo',
    lastVerified: '2026-05-01',
  },
  {
    id: 'universal-smartcard',
    name: 'Universal SmartCard Visa',
    issuer: 'Universal SmartCard',
    network: 'Visa',
    annualFee: 0,
    isOwnCard: true,      // our issued card — always available as fallback
    rates: {
      dining: 0.03,
      groceries: 0.02,
      travel: 0.03,
      gas: 0.02,
      online: 0.02,
      subscriptions: 0.02,
      healthcare: 0.02,
      general: 0.015,
    },
    notes: 'Universal SmartCard — issued by us via Stripe. No annual fee.',
    lastVerified: '2026-05-01',
  },
];

// MCC code → category mapping
const MCC_TO_CATEGORY = {
  '5812': 'dining', '5814': 'dining', '5811': 'dining', '5813': 'dining',
  '5411': 'groceries', '5422': 'groceries', '5441': 'groceries', '5451': 'groceries', '5462': 'groceries',
  '5541': 'gas', '5542': 'gas', '5172': 'gas',
  '3000': 'travel', '3001': 'travel', '4111': 'travel', '4112': 'travel',
  '4511': 'travel', '7011': 'travel', '7512': 'travel',
  '5965': 'online', '5999': 'online', '5734': 'online',
  '7372': 'subscriptions', '7375': 'subscriptions',
  '5912': 'healthcare', '8011': 'healthcare', '8021': 'healthcare', '8099': 'healthcare',
};

function getCategoryFromMCC(mccCode) {
  return MCC_TO_CATEGORY[mccCode] || 'general';
}

function getCardById(cardId) {
  return CARD_REWARDS_DB.find(c => c.id === cardId) || null;
}

module.exports = { CARD_REWARDS_DB, MCC_TO_CATEGORY, getCategoryFromMCC, getCardById };
