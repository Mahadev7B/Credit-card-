const logger = require('../config/logger');

// Push notifications disabled until APN credentials are configured
async function sendToUser(user, notification) {
  logger.info({ msg: 'Push notification skipped (APN not configured)', userId: user?._id, title: notification?.title });
}

async function sendTransactionNotification(user, transaction) {
  const amount = (transaction.amount / 100).toFixed(2);
  const merchant = transaction.merchantName || 'Unknown merchant';
  await sendToUser(user, { title: 'Transaction', body: `$${amount} at ${merchant}` });
}

async function sendCardStatusNotification(user, card, newStatus) {
  await sendToUser(user, { title: 'Card Update', body: `Card ending in ${card.last4} is now ${newStatus}` });
}

async function sendHealthAlertNotification(adminUsers, alertMessage) {
  for (const user of adminUsers) {
    await sendToUser(user, { title: 'Health Alert', body: alertMessage });
  }
}

module.exports = {
  sendToUser,
  sendTransactionNotification,
  sendCardStatusNotification,
  sendHealthAlertNotification,
};
