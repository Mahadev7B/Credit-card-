let plaidClient = null;
const env = process.env.PLAID_ENV || 'sandbox';

try {
  const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
  if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
    const configuration = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    plaidClient = new PlaidApi(configuration);
  }
} catch (_) {
  // plaid package not yet installed; routes will return 503
}

module.exports = { plaidClient, env };
