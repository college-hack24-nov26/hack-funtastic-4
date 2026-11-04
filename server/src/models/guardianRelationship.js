const mongoose = require('mongoose');

const guardianRelationshipSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  guardian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  relationship: { type: String, enum: ['parent', 'guardian', 'other'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'revoked'], default: 'pending', required: true },
  invitedAt: { type: Date, required: true, default: Date.now },
  verifiedAt: { type: Date, required: true, default: Date.now },
  approvedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

guardianRelationshipSchema.index({ student: 1, email: 1 }, { unique: true });
guardianRelationshipSchema.index({ guardian: 1, status: 1 });
guardianRelationshipSchema.index({ student: 1, status: 1 });

module.exports = mongoose.models.GuardianRelationship || mongoose.model('GuardianRelationship', guardianRelationshipSchema);
