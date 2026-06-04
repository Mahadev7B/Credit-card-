const mongoose = require('mongoose');

const plaidItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accessToken: { type: String, required: true, select: false },
  itemId: { type: String, required: true, unique: true },
  institutionId: { type: String },
  institutionName: { type: String },
  accounts: [{
    accountId: { type: String },
    name: { type: String },
    mask: { type: String },
    type: { type: String },
    subtype: { type: String },
  }],
  isActive: { type: Boolean, default: true },
  lastSyncAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('PlaidItem', plaidItemSchema);
