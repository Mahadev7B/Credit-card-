const mongoose = require('mongoose');

const routingCardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stripePaymentMethodId: { type: String, required: true },
    cardProductId: { type: String, required: true }, // id from cardRewardsDB
    nickname: { type: String, required: true, trim: true, maxlength: 50 },
    last4: { type: String, required: true },
    brand: { type: String },
    expMonth: { type: Number },
    expYear: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RoutingCard', routingCardSchema);
