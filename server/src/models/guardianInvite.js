const mongoose = require('mongoose');

const guardianInviteSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  relationship: { type: String, enum: ['parent', 'guardian', 'other'], required: true },
  tokenHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending', required: true },
  expiresAt: { type: Date, required: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

guardianInviteSchema.index({ student: 1, email: 1 }, { unique: true });
guardianInviteSchema.index({ tokenHash: 1 }, { unique: true });
guardianInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.GuardianInvite || mongoose.model('GuardianInvite', guardianInviteSchema);
