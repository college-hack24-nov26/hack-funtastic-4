const mongoose = require("mongoose");

const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topicSlug: { type: String, required: true },
    topicTitle: { type: String, required: true },
    objectives: [{ type: String }],
    notes: { type: String, default: "" },
    practiceCorrect: { type: Number, default: 0 },
    practiceTotal: { type: Number, default: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);
studySessionSchema.index({ userId: 1, topicSlug: 1, createdAt: -1 });

/* Audit log for admin actions */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: String },
    detail: { type: Object, default: {} },
  },
  { timestamps: true }
);
auditLogSchema.index({ createdAt: -1 });

/* Admin-editable AI / Debate configuration (Sahil contract) */
const aiConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    aiEnabled: { type: Boolean, default: false },
    allowedAgeGroups: [{ type: String }],
    moderationLevel: { type: String, enum: ["strict", "standard", "relaxed"], default: "strict" },
    promptVersion: { type: String, default: "v1" },
    debateEnabled: { type: Boolean, default: false },
    debateScoringWeights: {
      reasoning: { type: Number, default: 40 },
      evidence: { type: Number, default: 30 },
      respect: { type: Number, default: 30 },
    },
    updatedAtBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const StudySession = mongoose.model("StudySession", studySessionSchema);
const AuditLog = mongoose.model("AuditLog", auditLogSchema);
const AiConfig = mongoose.model("AiConfig", aiConfigSchema);

module.exports = { StudySession, AuditLog, AiConfig };
