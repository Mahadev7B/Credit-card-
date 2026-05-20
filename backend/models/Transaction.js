const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    stripeAuthorizationId: { type: String, unique: true, sparse: true },
    stripeTransactionId: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd', uppercase: true },
    merchantName: { type: String },
    merchantCategory: { type: String },
    mccCode: { type: String },
    status: {
      type: String,
      enum: ['pending', 'authorized', 'captured', 'reversed', 'declined'],
      default: 'pending',
    },
    declineReason: { type: String },
    cashbackAmount: { type: Number, default: 0 },
    cashbackRate: { type: Number, default: 0 },
    rewardCategory: { type: String },
    fallbackApplied: { type: Boolean, default: false },
    fallbackReason: { type: String },
    metadata: { type: Map, of: String },
    authorizedAt: { type: Date },
    capturedAt: { type: Date },
    reversedAt: { type: Date },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ cardId: 1, createdAt: -1 });
transactionSchema.index({ mccCode: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
