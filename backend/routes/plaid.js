const router = require('express').Router();
const { plaidClient } = require('../config/plaid');
const { authenticate } = require('../middleware/auth');
const PlaidItem = require('../models/PlaidItem');
const logger = require('../config/logger');

function requirePlaid(req, res, next) {
  if (!plaidClient) return res.status(503).json({ error: 'Plaid integration not configured' });
  next();
}

router.use(authenticate);

// ── Create link token ──
router.post('/link-token', requirePlaid, async (req, res, next) => {
  try {
    const config = {
      user: { client_user_id: req.user._id.toString() },
      client_name: 'GeoRewards',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    };
    if (process.env.PLAID_REDIRECT_URI) {
      config.redirect_uri = process.env.PLAID_REDIRECT_URI;
    }
    const response = await plaidClient.linkTokenCreate(config);
    res.json({ linkToken: response.data.link_token });
  } catch (err) {
    logger.error({ err }, 'Plaid linkTokenCreate failed');
    next(err);
  }
});

// ── Exchange public token → access token ──
router.post('/exchange', requirePlaid, async (req, res, next) => {
  try {
    const { publicToken } = req.body;
    if (!publicToken || typeof publicToken !== 'string') {
      return res.status(400).json({ error: 'publicToken is required' });
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchangeRes.data;

    // Get institution info
    const itemRes = await plaidClient.itemGet({ access_token });
    const institutionId = itemRes.data.item.institution_id;

    let institutionName = 'Unknown Bank';
    if (institutionId) {
      try {
        const instRes = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US'],
        });
        institutionName = instRes.data.institution.name;
      } catch (_) {}
    }

    // Get accounts
    const accountsRes = await plaidClient.accountsGet({ access_token });
    const accounts = accountsRes.data.accounts.map(a => ({
      accountId: a.account_id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
    }));

    // Upsert — replace if same item_id reconnected
    const item = await PlaidItem.findOneAndUpdate(
      { itemId: item_id },
      {
        userId: req.user._id,
        accessToken: access_token,
        itemId: item_id,
        institutionId,
        institutionName,
        accounts,
        isActive: true,
        lastSyncAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const safeItem = item.toObject();
    delete safeItem.accessToken;
    res.json({ success: true, item: safeItem });
  } catch (err) {
    logger.error({ err }, 'Plaid token exchange failed');
    next(err);
  }
});

// ── List connected bank items ──
router.get('/items', requirePlaid, async (req, res, next) => {
  try {
    const items = await PlaidItem.find({ userId: req.user._id, isActive: true }).sort({ createdAt: -1 });
    res.json({ items: items.map(i => { const o = i.toObject(); delete o.accessToken; return o; }) });
  } catch (err) {
    next(err);
  }
});

// ── Disconnect a bank ──
router.delete('/items/:id', requirePlaid, async (req, res, next) => {
  try {
    const item = await PlaidItem.findOne({ _id: req.params.id, userId: req.user._id }).select('+accessToken');
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Best-effort removal from Plaid
    try { await plaidClient.itemRemove({ access_token: item.accessToken }); } catch (_) {}

    item.isActive = false;
    await item.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── $1,007 analysis — 12 months of Plaid data ──
const PLAID_CATEGORY_MAP = [
  { primary: 'Food and Drink', secondary: ['Restaurant', 'Fast Food', 'Coffee', 'Bar'], category: 'dining' },
  { primary: 'Food and Drink', secondary: ['Grocery', 'Supermarket'], category: 'groceries' },
  { primary: 'Food and Drink', secondary: [], category: 'dining' },
  { primary: 'Travel', secondary: [], category: 'travel' },
  { primary: 'Shops', secondary: ['Gas Station', 'Fuel'], category: 'gas' },
  { primary: 'Shops', secondary: ['Digital Purchase', 'Computer', 'Electronics'], category: 'online' },
  { primary: 'Shops', secondary: [], category: 'general' },
  { primary: 'Service', secondary: ['Internet', 'Streaming', 'Subscription', 'Digital'], category: 'subscriptions' },
  { primary: 'Service', secondary: ['Medical', 'Dental', 'Health', 'Pharmacy'], category: 'healthcare' },
  { primary: 'Healthcare', secondary: [], category: 'healthcare' },
  { primary: 'Pharmacies', secondary: [], category: 'healthcare' },
];

const SMARTCARD_RATES = {
  dining: 0.03,
  groceries: 0.02,
  travel: 0.03,
  gas: 0.02,
  online: 0.02,
  subscriptions: 0.02,
  healthcare: 0.02,
  general: 0.015,
};
const BASELINE_RATE = 0.01;
const SKIP_PRIMARY = new Set(['Transfer', 'Payment', 'Bank Fees', 'Tax', 'Interest', 'Loans', 'Credit Card']);

function mapPlaidCategory(cats) {
  if (!cats || !cats.length) return 'general';
  const primary = cats[0];
  const secondary = cats[1] || '';
  if (SKIP_PRIMARY.has(primary)) return null;
  for (const rule of PLAID_CATEGORY_MAP) {
    if (rule.primary !== primary) continue;
    if (!rule.secondary.length) return rule.category;
    if (rule.secondary.some(s => secondary.includes(s))) return rule.category;
  }
  return 'general';
}

router.get('/analyze', requirePlaid, async (req, res, next) => {
  try {
    const items = await PlaidItem.find({ userId: req.user._id, isActive: true }).select('+accessToken');
    if (!items.length) {
      return res.json({ analyzed: false, reason: 'No connected banks. Connect a bank account to run your analysis.' });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const allTransactions = [];

    for (const item of items) {
      try {
        let offset = 0;
        const batchSize = 500;
        while (true) {
          const txRes = await plaidClient.transactionsGet({
            access_token: item.accessToken,
            start_date: startStr,
            end_date: endStr,
            options: { count: batchSize, offset, include_personal_finance_category: false },
          });
          allTransactions.push(...txRes.data.transactions);
          offset += txRes.data.transactions.length;
          if (offset >= txRes.data.total_transactions) break;
          if (offset >= 2000) break; // safety cap per item
        }
        item.lastSyncAt = new Date();
        await item.save();
      } catch (itemErr) {
        logger.warn({ err: itemErr, itemId: item.itemId }, 'Failed to fetch transactions for item');
      }
    }

    let totalSpend = 0;
    let baselineRewards = 0;
    let smartcardRewards = 0;
    const byCat = {};
    let txCount = 0;

    for (const tx of allTransactions) {
      if (tx.pending) continue;
      if (tx.amount <= 0) continue; // credits/refunds
      const category = mapPlaidCategory(tx.category);
      if (!category) continue; // skip transfers, payments etc.

      const amount = tx.amount;
      const rate = SMARTCARD_RATES[category] || SMARTCARD_RATES.general;

      totalSpend += amount;
      baselineRewards += amount * BASELINE_RATE;
      smartcardRewards += amount * rate;
      txCount++;

      if (!byCat[category]) byCat[category] = { spend: 0, smartcard: 0, baseline: 0, count: 0 };
      byCat[category].spend += amount;
      byCat[category].smartcard += amount * rate;
      byCat[category].baseline += amount * BASELINE_RATE;
      byCat[category].count++;
    }

    const r = v => Math.round(v * 100) / 100;

    res.json({
      analyzed: true,
      summary: {
        totalSpend: r(totalSpend),
        baselineRewards: r(baselineRewards),
        smartcardRewards: r(smartcardRewards),
        extraRewards: r(smartcardRewards - baselineRewards),
        transactionCount: txCount,
        periodMonths: 12,
      },
      byCategory: Object.entries(byCat)
        .map(([cat, d]) => ({
          category: cat,
          spend: r(d.spend),
          smartcardRewards: r(d.smartcard),
          baselineRewards: r(d.baseline),
          extra: r(d.smartcard - d.baseline),
          count: d.count,
        }))
        .sort((a, b) => b.extra - a.extra),
    });
  } catch (err) {
    logger.error({ err }, 'Plaid analyze failed');
    next(err);
  }
});

module.exports = router;
