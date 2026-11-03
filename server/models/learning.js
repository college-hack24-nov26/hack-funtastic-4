const mongoose = require("mongoose");
const { AGE_GROUPS } = require("./user");

/* Ashram - five transformation stages */
const ashramStageSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    purpose: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
    requiredActivities: [{ kind: String, ref: String, count: Number }],
    requiredCount: { type: Number, default: 1, min: 1 },
    unlockAfterStage: { type: Number, default: 0 },
    ageGroups: [{ type: String, enum: AGE_GROUPS }],
    rewards: { coins: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

/* Student completion record for one ashram stage */
const ashramProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stageSlug: { type: String, required: true },
    completedAt: { type: Date },
    activityCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
ashramProgressSchema.index({ userId: 1, stageSlug: 1 }, { unique: true });

/* Unified student progress ledger over all learning activities */
const progressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ["lesson", "story", "mission", "game", "quest", "library", "study", "test", "loka", "chamber-chapter", "ashram-stage"],
      index: true,
    },
    refSlug: { type: String, required: true },
    title: { type: String },
    score: { type: Number, default: null },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);
progressSchema.index({ userId: 1, kind: 1, refSlug: 1 }, { unique: true });

const AshramStage = mongoose.model("AshramStage", ashramStageSchema);
const AshramProgress = mongoose.model("AshramProgress", ashramProgressSchema);
const Progress = mongoose.model("Progress", progressSchema);

module.exports = { AshramStage, AshramProgress, Progress, AGE_GROUPS };
