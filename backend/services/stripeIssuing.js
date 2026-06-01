const stripe = require('../config/stripe');
const logger = require('../config/logger');

async function createCardholder({ email, firstName, lastName, phone, acceptanceIp }) {
  const customer = await stripe.customers.create({
    email,
    name: `${firstName} ${lastName}`,
    phone,
  });

  const cardholder = await stripe.issuing.cardholders.create({
    type: 'individual',
    name: `${firstName} ${lastName}`,
    email,
    phone_number: phone,
    individual: {
      first_name: firstName,
      last_name: lastName,
      card_issuing: {
        user_terms_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: acceptanceIp || '127.0.0.1',
        },
      },
    },
    billing: {
      address: {
        line1: '1 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
    },
  });

  logger.info({ msg: 'Stripe cardholder created', cardholderId: cardholder.id });
  return { customerId: customer.id, cardholderId: cardholder.id };
}

async function createCard({ cardholderId, type, spendingLimit, spendingLimitInterval, shipping }) {
  const cardParams = {
    cardholder: cardholderId,
    currency: 'usd',
    type: type === 'physical' ? 'physical' : 'virtual',
    status: 'active',
  };

  if (spendingLimit && spendingLimitInterval) {
    cardParams.spending_controls = {
      spending_limits: [
        {
          amount: Math.round(spendingLimit * 100),
          interval: spendingLimitInterval,
        },
      ],
    };
  }

  if (type === 'physical' && shipping) {
    cardParams.shipping = {
      name: shipping.name,
      address: {
        line1: shipping.line1,
        line2: shipping.line2 || undefined,
        city: shipping.city,
        state: shipping.state,
        postal_code: shipping.postalCode,
        country: shipping.country || 'US',
      },
      service: 'standard',
    };
  }

  const card = await stripe.issuing.cards.create(cardParams);
  logger.info({ msg: 'Stripe issuing card created', cardId: card.id, type });
  return card;
}

async function getCardSensitiveData(stripeCardId) {
  // Returns ephemeral key data for PCI-compliant display on client
  const card = await stripe.issuing.cards.retrieve(stripeCardId, {
    expand: ['number', 'cvc'],
  });
  return {
    number: card.number,
    cvc: card.cvc,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
}

async function updateCardStatus(stripeCardId, status) {
  await stripe.issuing.cards.update(stripeCardId, { status });
  logger.info({ msg: 'Card status updated', stripeCardId, status });
}

async function cancelCard(stripeCardId) {
  await stripe.issuing.cards.update(stripeCardId, { status: 'canceled' });
  logger.info({ msg: 'Card canceled', stripeCardId });
}

async function updateSpendingControls(stripeCardId, limits) {
  await stripe.issuing.cards.update(stripeCardId, {
    spending_controls: { spending_limits: limits },
  });
}

async function listCardTransactions(stripeCardId, { limit = 20, startingAfter } = {}) {
  const params = { card: stripeCardId, limit };
  if (startingAfter) params.starting_after = startingAfter;
  return stripe.issuing.transactions.list(params);
}

module.exports = {
  createCardholder,
  createCard,
  getCardSensitiveData,
  updateCardStatus,
  cancelCard,
  updateSpendingControls,
  listCardTransactions,
};
