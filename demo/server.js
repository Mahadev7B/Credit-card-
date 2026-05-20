const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const JWT_SECRET = 'demo-secret-key';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory mock database ───────────────────────────────────────────────

const users = [
  {
    id: 'u1',
    email: 'demo@smartcard.com',
    passwordHash: bcrypt.hashSync('demo1234', 10),
    firstName: 'Alex',
    lastName: 'Rivera',
    rewardsBalance: 47.82,
    totalCashback: 124.50,
    kycStatus: 'approved',
  },
];

const cards = [
  {
    id: 'c1', userId: 'u1',
    last4: '4242', expMonth: 12, expYear: 28,
    brand: 'Visa', type: 'virtual', status: 'active',
    nickname: 'Daily Driver', rewardsTier: 'gold',
    spendingLimit: 2000, spendingLimitInterval: 'monthly',
    walletProvisioned: false, createdAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'c2', userId: 'u1',
    last4: '8888', expMonth: 9, expYear: 27,
    brand: 'Visa', type: 'physical', status: 'active',
    nickname: 'Travel Card', rewardsTier: 'platinum',
    spendingLimit: 10000, spendingLimitInterval: 'monthly',
    walletProvisioned: true, createdAt: '2024-06-01T10:00:00Z',
  },
];

const transactions = [
  { id: 't1', cardId: 'c1', amount: 4280, merchantName: 'Blue Bottle Coffee', mccCode: '5812', rewardCategory: 'dining', cashbackAmount: 1.71, cashbackRate: 0.04, status: 'captured', createdAt: '2026-05-19T08:30:00Z' },
  { id: 't2', cardId: 'c2', amount: 89500, merchantName: 'United Airlines', mccCode: '4511', rewardCategory: 'travel', cashbackAmount: 44.75, cashbackRate: 0.05, status: 'captured', createdAt: '2026-05-18T14:00:00Z' },
  { id: 't3', cardId: 'c1', amount: 12340, merchantName: 'Whole Foods Market', mccCode: '5411', rewardCategory: 'groceries', cashbackAmount: 3.70, cashbackRate: 0.03, status: 'captured', createdAt: '2026-05-17T11:15:00Z' },
  { id: 't4', cardId: 'c1', amount: 6500, merchantName: 'Shell Gas Station', mccCode: '5541', rewardCategory: 'gas', cashbackAmount: 1.95, cashbackRate: 0.03, status: 'captured', createdAt: '2026-05-16T09:00:00Z' },
  { id: 't5', cardId: 'c2', amount: 1499, merchantName: 'Netflix', mccCode: '7372', rewardCategory: 'subscriptions', cashbackAmount: 0.30, cashbackRate: 0.02, status: 'captured', createdAt: '2026-05-15T00:00:00Z' },
  { id: 't6', cardId: 'c1', amount: 23400, merchantName: 'Hilton Hotels', mccCode: '7011', rewardCategory: 'travel', cashbackAmount: 11.70, cashbackRate: 0.05, status: 'captured', createdAt: '2026-05-14T16:30:00Z' },
  { id: 't7', cardId: 'c1', amount: 3200, merchantName: 'CVS Pharmacy', mccCode: '5912', rewardCategory: 'healthcare', cashbackAmount: 0.64, cashbackRate: 0.02, status: 'captured', createdAt: '2026-05-13T10:00:00Z' },
  { id: 't8', cardId: 'c2', amount: 15000, merchantName: 'Amazon', mccCode: '5999', rewardCategory: 'online', cashbackAmount: 3.00, cashbackRate: 0.02, status: 'captured', createdAt: '2026-05-12T12:00:00Z' },
  { id: 't9', cardId: 'c1', amount: 8900, merchantName: 'Uber Eats', mccCode: '5812', rewardCategory: 'dining', cashbackAmount: 3.56, cashbackRate: 0.04, status: 'captured', createdAt: '2026-05-11T19:45:00Z' },
  { id: 't10', cardId: 'c1', amount: 2100, merchantName: 'Walgreens', mccCode: '5912', rewardCategory: 'healthcare', cashbackAmount: 0.00, cashbackRate: 0.00, status: 'declined', createdAt: '2026-05-10T14:30:00Z' },
];

// ─── Auth helpers ──────────────────────────────────────────────────────────

function auth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = users.find(u => u.id === payload.sub);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth routes ───────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: safeUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email taken' });
  const newUser = {
    id: 'u' + Date.now(),
    email, firstName, lastName,
    passwordHash: await bcrypt.hash(password, 10),
    rewardsBalance: 0, totalCashback: 0, kycStatus: 'approved',
  };
  users.push(newUser);
  const token = jwt.sign({ sub: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: safeUser(newUser) });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

// ─── Card routes ───────────────────────────────────────────────────────────

app.get('/api/cards', auth, (req, res) => {
  res.json({ cards: cards.filter(c => c.userId === req.user.id && c.status !== 'canceled') });
});

app.post('/api/cards', auth, (req, res) => {
  const { type = 'virtual', nickname, spendingLimit, spendingLimitInterval } = req.body;
  const newCard = {
    id: 'c' + Date.now(), userId: req.user.id,
    last4: String(Math.floor(1000 + Math.random() * 9000)),
    expMonth: 12, expYear: 29,
    brand: 'Visa', type, status: 'active',
    nickname: nickname || null,
    rewardsTier: 'standard',
    spendingLimit: spendingLimit || null,
    spendingLimitInterval: spendingLimitInterval || null,
    walletProvisioned: false,
    createdAt: new Date().toISOString(),
  };
  cards.push(newCard);
  res.status(201).json({ card: newCard });
});

app.get('/api/cards/:id', auth, (req, res) => {
  const card = cards.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const sensitiveData = card.status === 'active'
    ? { number: '4242424242424242', cvc: '737', expMonth: card.expMonth, expYear: card.expYear }
    : null;
  res.json({ card, sensitiveData });
});

app.patch('/api/cards/:id/status', auth, (req, res) => {
  const card = cards.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!card) return res.status(404).json({ error: 'Not found' });
  card.status = req.body.status;
  res.json({ card });
});

app.delete('/api/cards/:id', auth, (req, res) => {
  const card = cards.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!card) return res.status(404).json({ error: 'Not found' });
  card.status = 'canceled';
  res.json({ success: true });
});

// ─── Transactions ──────────────────────────────────────────────────────────

app.get('/api/cards/:id/transactions', auth, (req, res) => {
  const card = cards.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!card) return res.status(404).json({ error: 'Not found' });
  const txs = transactions.filter(t => t.cardId === req.params.id);
  res.json({ transactions: txs, total: txs.length, page: 1, pages: 1 });
});

// Simulate a new live transaction
app.post('/api/cards/:id/simulate-transaction', auth, (req, res) => {
  const card = cards.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  const merchants = [
    { name: 'Starbucks', mcc: '5812', cat: 'dining', rate: 0.04 },
    { name: 'Trader Joe\'s', mcc: '5411', cat: 'groceries', rate: 0.03 },
    { name: 'Delta Airlines', mcc: '4511', cat: 'travel', rate: 0.05 },
    { name: 'Chevron', mcc: '5541', cat: 'gas', rate: 0.03 },
    { name: 'Spotify', mcc: '7372', cat: 'subscriptions', rate: 0.02 },
  ];
  const m = merchants[Math.floor(Math.random() * merchants.length)];
  const amount = Math.floor(500 + Math.random() * 15000);
  const cashback = Math.round(amount * m.rate) / 100;
  const tx = {
    id: 't' + Date.now(), cardId: req.params.id,
    amount, merchantName: m.name, mccCode: m.mcc,
    rewardCategory: m.cat, cashbackAmount: cashback,
    cashbackRate: m.rate, status: 'captured',
    createdAt: new Date().toISOString(),
  };
  transactions.unshift(tx);
  const user = users.find(u => u.id === req.user.id);
  user.rewardsBalance = Math.round((user.rewardsBalance + cashback) * 100) / 100;
  user.totalCashback = Math.round((user.totalCashback + cashback) * 100) / 100;
  res.json({ transaction: tx });
});

// ─── Rewards ───────────────────────────────────────────────────────────────

app.get('/api/rewards/balance', auth, (req, res) => {
  res.json({ balance: req.user.rewardsBalance, totalEarned: req.user.totalCashback });
});

app.get('/api/rewards/history', auth, (req, res) => {
  const txs = transactions.filter(t =>
    cards.find(c => c.id === t.cardId && c.userId === req.user.id) && t.cashbackAmount > 0
  );
  res.json({ transactions: txs, total: txs.length, page: 1, pages: 1 });
});

// ─── Statements ────────────────────────────────────────────────────────────

app.get('/api/statements/summary', auth, (req, res) => {
  const userCards = cards.filter(c => c.userId === req.user.id);
  const userTxs = transactions.filter(t => userCards.find(c => c.id === t.cardId) && t.status === 'captured');
  const totalSpend = userTxs.reduce((s, t) => s + t.amount, 0) / 100;
  const totalCashback = userTxs.reduce((s, t) => s + t.cashbackAmount, 0);
  const byCategory = {};
  for (const tx of userTxs) {
    const cat = tx.rewardCategory || 'general';
    if (!byCategory[cat]) byCategory[cat] = { amount: 0, count: 0, cashback: 0 };
    byCategory[cat].amount += tx.amount / 100;
    byCategory[cat].count += 1;
    byCategory[cat].cashback += tx.cashbackAmount;
  }
  res.json({ summary: { totalSpend, totalCashback, transactionCount: userTxs.length, byCategory } });
});

function safeUser(u) {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, rewardsBalance: u.rewardsBalance, totalCashback: u.totalCashback, kycStatus: u.kycStatus };
}

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(3000, () => console.log('\n🚀 Smart Card Demo running at http://localhost:3000\n   Login: demo@smartcard.com / demo1234\n'));
