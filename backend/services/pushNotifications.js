const apn = require('apn');
const logger = require('../config/logger');

let apnProvider = null;

function getAPNProvider() {
  if (apnProvider) return apnProvider;
  if (!process.env.APN_KEY || !process.env.APN_KEY_ID || !process.env.APN_TEAM_ID) {
    logger.warn('APN credentials not configured — push notifications disabled');
    return null;
  }
  apnProvider = new apn.Provider({
    token: {
      key: process.env.APN_KEY,
      keyId: process.env.APN_KEY_ID,
      teamId: process.env.APN_TEAM_ID,
    },
    production: process.env.NODE_ENV === 'production',
  });
  return apnProvider;
}

async function sendToUser(user, notification) {
  const provider = getAPNProvider();
  if (!provider || !user.pushTokens?.length) return;

  const iosTokens = user.pushTokens
    .filter((t) => t.platform === 'ios')
    .map((t) => t.token);

  if (iosTokens.length === 0) return;

  const note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.badge = 1;
  note.sound = 'default';
  note.alert = { title: notification.title, body: notification.body };
  note.payload = notification.data || {};
  note.topic = process.env.APN_BUNDLE_ID || 'com.smartcard.app';

  try {
    const result = await provider.send(note, iosTokens);
    if (result.failed.length > 0) {
      logger.warn({ msg: 'Some push notifications failed', failures: result.failed });
    }
    logger.info({ msg: 'Push notifications sent', sent: result.sent.length, userId: user._id });
  } catch (err) {
    logger.error({ msg: 'Push notification error', err });
  }
}

async function sendTransactionNotification(user, transaction) {
  const amount = (transaction.amount / 100).toFixed(2);
  const merchant = transaction.merchantName || 'Unknown merchant';

  const notification = {
    title: transaction.status === 'declined' ? 'Transaction Declined' : 'Transaction Approved',
    body:
      transaction.status === 'declined'
        ? `$${amount} at ${merchant} was declined`
        : `$${amount} at ${merchant}${transaction.cashbackAmount > 0 ? ` • Earned $${transaction.cashbackAmount.toFixed(2)} cashback` : ''}`,
    data: {
      type: 'transaction',
      transactionId: transaction._id.toString(),
      status: transaction.status,
    },
  };

  await sendToUser(user, notification);
}

async function sendCardStatusNotification(user, card, newStatus) {
  const statusMessages = {
    active: { title: 'Card Activated', body: `Your card ending in ${card.last4} is now active` },
    inactive: { title: 'Card Paused', body: `Your card ending in ${card.last4} has been paused` },
    frozen: { title: 'Card Frozen', body: `Your card ending in ${card.last4} has been frozen for security` },
    canceled: { title: 'Card Canceled', body: `Your card ending in ${card.last4} has been canceled` },
  };

  const notification = statusMessages[newStatus] || {
    title: 'Card Update',
    body: `Your card ending in ${card.last4} status changed to ${newStatus}`,
  };
  notification.data = { type: 'card_status', cardId: card._id.toString(), status: newStatus };

  await sendToUser(user, notification);
}

async function sendHealthAlertNotification(adminUsers, alertMessage) {
  for (const user of adminUsers) {
    await sendToUser(user, {
      title: 'System Health Alert',
      body: alertMessage,
      data: { type: 'health_alert' },
    });
  }
}

module.exports = {
  sendToUser,
  sendTransactionNotification,
  sendCardStatusNotification,
  sendHealthAlertNotification,
};
