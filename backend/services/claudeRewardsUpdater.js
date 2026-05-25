const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

const DB_PATH = path.join(__dirname, '../data/cardRewardsDB.js');

// Called weekly by the cron job. Asks Claude to verify/update rates for each card.
async function refreshCardRates() {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — skipping card rewards refresh');
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { CARD_REWARDS_DB } = require('../data/cardRewardsDB');

  logger.info('Starting weekly card rewards refresh via Claude API');

  const updates = [];

  for (const card of CARD_REWARDS_DB) {
    if (card.isOwnCard) continue; // skip our own card

    try {
      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a credit card rewards database maintainer.

For the "${card.name}" issued by ${card.issuer}, provide the current cashback-equivalent reward rates for these merchant categories. Use the best typical redemption value for points (e.g. Chase points at 1.25¢ each via Chase Travel).

Return ONLY a JSON object with these exact keys and decimal rates (e.g. 0.03 for 3%):
{
  "dining": number,
  "groceries": number,
  "travel": number,
  "gas": number,
  "online": number,
  "subscriptions": number,
  "healthcare": number,
  "general": number,
  "notes": "one sentence about key limitations or highlights"
}

Current rates for reference: ${JSON.stringify(card.rates)}

If rates are unchanged or you're uncertain, return the same values. Only update if you have confident information about a change.`,
        }],
      });

      const text = message.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn({ card: card.id, msg: 'Claude returned no JSON' });
        continue;
      }

      const updated = JSON.parse(jsonMatch[0]);
      const { notes, ...rates } = updated;

      updates.push({
        cardId: card.id,
        rates,
        notes: notes || card.notes,
        lastVerified: new Date().toISOString().split('T')[0],
      });

      logger.info({ card: card.id, msg: 'Rates refreshed' });
    } catch (err) {
      logger.error({ card: card.id, msg: 'Failed to refresh rates', err: err.message });
    }
  }

  if (updates.length > 0) {
    await writeUpdatesToDB(updates);
    logger.info({ count: updates.length, msg: 'Card rewards DB updated' });
  }

  return updates;
}

async function writeUpdatesToDB(updates) {
  let source = fs.readFileSync(DB_PATH, 'utf8');

  for (const update of updates) {
    // Find the card entry in source and update its rates and lastVerified
    const cardIdRegex = new RegExp(
      `(id: '${update.cardId}'[\\s\\S]*?rates: \\{)[\\s\\S]*?(\\},\\s*notes:)`,
      'g'
    );

    const ratesStr = Object.entries(update.rates)
      .map(([k, v]) => `      ${k}: ${v},`)
      .join('\n');

    source = source.replace(cardIdRegex, (match, before, after) => {
      return `${before}\n${ratesStr}\n    ${after}`;
    });

    // Update lastVerified date
    source = source.replace(
      new RegExp(`(id: '${update.cardId}'[\\s\\S]*?lastVerified: ')[^']*(')`),
      `$1${update.lastVerified}$2`
    );
  }

  fs.writeFileSync(DB_PATH, source, 'utf8');
}

module.exports = { refreshCardRates };
