const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stripeCardId: { type: String, required: true, unique: true },
    stripeCardholderId: { type: String, required: true },
    last4: { type: String, required: true },
    expMonth: { type: Number, required: true },
    expYear: { type: Number, required: true },
    brand: { type: String, default: 'Visa' },
    type: { type: String, enum: ['virtual', 'physical'], default: 'virtual' },
    status: { type: String, enum: ['active', 'inactive', 'canceled', 'frozen'], default: 'active' },
    spendingLimit: { type: Number },
    spendingLimitInterval: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    walletProvisioned: { type: Boolean, default: false },
    appleWalletPassId: { type: String },
    nickname: { type: String, trim: true },
    rewardsTier: { type: String, enum: ['standard', 'gold', 'platinum'], default: 'standard' },
    mccRewardsConfig: [
      {
        mccCode: String,
        category: String,
        cashbackRate: Number,
      },
    ],
    metadata: { type: Map, of: String },
  },
  { timestamps: true }
);

cardSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Card', cardSchema);
