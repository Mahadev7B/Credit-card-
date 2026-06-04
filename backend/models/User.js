const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },
    stripeCustomerId: { type: String },
    stripeCardholderId: { type: String },
    pushTokens: [{ token: String, platform: String, createdAt: Date }],
    rewardsBalance: { type: Number, default: 0 },
    totalCashback: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    kycStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    linkedCards: [{
      cardId: { type: String, required: true },
      nickname: { type: String, required: true, trim: true, maxlength: 50 },
      last4: { type: String, match: /^\d{4}$/ },
      color: { type: String, match: /^#[0-9A-Fa-f]{6}$/ },
      addedAt: { type: Date, default: Date.now },
    }],
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

userSchema.methods.verifyPassword = function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema);
