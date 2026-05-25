const PDFDocument = require('pdfkit');
const { createObjectCsvStringifier } = require('csv-writer');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const logger = require('../config/logger');

async function fetchTransactions({ userId, startDate, endDate, cardId }) {
  const query = {
    userId,
    createdAt: { $gte: startDate, $lte: endDate },
    status: { $in: ['authorized', 'captured'] },
  };
  if (cardId) query.cardId = cardId;
  return Transaction.find(query).sort({ createdAt: 1 }).populate('cardId', 'last4 nickname');
}

async function getSummary({ userId, startDate, endDate, cardId }) {
  const transactions = await fetchTransactions({ userId, startDate, endDate, cardId });

  const summary = {
    period: { startDate, endDate },
    totalSpend: 0,
    totalCashback: 0,
    transactionCount: transactions.length,
    byCategory: {},
  };

  for (const tx of transactions) {
    summary.totalSpend += tx.amount;
    summary.totalCashback += tx.cashbackAmount || 0;

    const cat = tx.rewardCategory || 'general';
    if (!summary.byCategory[cat]) {
      summary.byCategory[cat] = { amount: 0, count: 0, cashback: 0 };
    }
    summary.byCategory[cat].amount += tx.amount;
    summary.byCategory[cat].count += 1;
    summary.byCategory[cat].cashback += tx.cashbackAmount || 0;
  }

  summary.totalSpend = summary.totalSpend / 100;
  summary.totalCashback = summary.totalCashback / 100;
  for (const cat of Object.values(summary.byCategory)) {
    cat.amount = cat.amount / 100;
    cat.cashback = cat.cashback / 100;
  }

  return summary;
}

async function generatePDF({ userId, user, startDate, endDate, cardId }) {
  const transactions = await fetchTransactions({ userId, startDate, endDate, cardId });
  const summary = await getSummary({ userId, startDate, endDate, cardId });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Smart Card Statement', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(
      `${user.firstName} ${user.lastName} • ${user.email}`,
      { align: 'center' }
    );
    doc.text(
      `Period: ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`,
      { align: 'center' }
    );
    doc.moveDown();

    // Summary box
    doc.rect(50, doc.y, 512, 80).fillAndStroke('#f5f5f5', '#cccccc');
    const summaryY = doc.y + 10;
    doc.fillColor('#000')
      .fontSize(11)
      .text(`Total Spend: $${summary.totalSpend.toFixed(2)}`, 70, summaryY)
      .text(`Cashback Earned: $${summary.totalCashback.toFixed(2)}`, 70, summaryY + 18)
      .text(`Transactions: ${summary.transactionCount}`, 70, summaryY + 36);
    doc.moveDown(5);

    // Transactions table header
    doc.fontSize(10).font('Helvetica-Bold');
    const cols = { date: 50, merchant: 130, category: 300, cashback: 390, amount: 480 };
    doc.text('Date', cols.date, doc.y)
      .text('Merchant', cols.merchant, doc.y)
      .text('Category', cols.category, doc.y)
      .text('Cashback', cols.cashback, doc.y)
      .text('Amount', cols.amount, doc.y);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.3);

    // Transaction rows
    doc.font('Helvetica').fontSize(9);
    for (const tx of transactions) {
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }
      const y = doc.y;
      const amount = (tx.amount / 100).toFixed(2);
      const cashback = tx.cashbackAmount > 0 ? `$${tx.cashbackAmount.toFixed(2)}` : '—';
      const date = new Date(tx.createdAt).toLocaleDateString();
      const merchant = (tx.merchantName || 'Unknown').slice(0, 28);

      doc.text(date, cols.date, y)
        .text(merchant, cols.merchant, y)
        .text(tx.rewardCategory || 'general', cols.category, y)
        .text(cashback, cols.cashback, y)
        .text(`$${amount}`, cols.amount, y);
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

async function generateCSV({ userId, startDate, endDate, cardId }) {
  const transactions = await fetchTransactions({ userId, startDate, endDate, cardId });

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: 'date', title: 'Date' },
      { id: 'merchant', title: 'Merchant' },
      { id: 'category', title: 'Category' },
      { id: 'mcc', title: 'MCC Code' },
      { id: 'amount', title: 'Amount (USD)' },
      { id: 'cashback', title: 'Cashback (USD)' },
      { id: 'cashbackRate', title: 'Cashback Rate' },
      { id: 'status', title: 'Status' },
      { id: 'card', title: 'Card (Last 4)' },
    ],
  });

  const records = transactions.map((tx) => ({
    date: new Date(tx.createdAt).toISOString().slice(0, 10),
    merchant: tx.merchantName || '',
    category: tx.rewardCategory || 'general',
    mcc: tx.mccCode || '',
    amount: (tx.amount / 100).toFixed(2),
    cashback: (tx.cashbackAmount || 0).toFixed(2),
    cashbackRate: tx.cashbackRate ? `${(tx.cashbackRate * 100).toFixed(1)}%` : '1.0%',
    status: tx.status,
    card: tx.cardId?.last4 || '',
  }));

  return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
}

module.exports = { generatePDF, generateCSV, getSummary };
