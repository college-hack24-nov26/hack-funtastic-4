const mongoose = require("mongoose");

/* Rewards ledger - coins awarded by activity, spent in the shop */
const rewardEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    delta: { type: Number, required: true }, // positive = earned, negative = spent
    reason: { type: String, required: true },
    kind: { type: String, default: "activity" },
    refSlug: { type: String, default: null },
  },
  { timestamps: true }
);
rewardEntrySchema.index({ userId: 1, createdAt: -1 });

const RewardEntry = mongoose.model("RewardEntry", rewardEntrySchema);

/* Badge definitions (admin managed) */
const badgeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, default: "star" },
    rule: {
      type: { type: String, enum: ["lessons", "stories", "missions", "games", "quests", "coins", "ashram-stage"], required: true },
      threshold: { type: Number, required: true },
    },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published" },
  },
  { timestamps: true }
);

const Badge = mongoose.model("Badge", badgeSchema);

/* Earned badges per student */
const badgeAwardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    badgeSlug: { type: String, required: true },
    awardedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
badgeAwardSchema.index({ userId: 1, badgeSlug: 1 }, { unique: true });

const BadgeAward = mongoose.model("BadgeAward", badgeAwardSchema);

module.exports = { RewardEntry, Badge, BadgeAward };
