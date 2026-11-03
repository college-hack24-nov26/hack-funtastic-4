const mongoose = require("mongoose");

const decisionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    options: [
      {
        label: { type: String, required: true },
        outcome: { type: String, required: true },
        ethicalWeight: { type: Number, default: 0 }, // e.g. -2 harsh, 0 neutral, +2 compassionate
        consequenceExplanation: { type: String, required: true },
      },
    ],
  },
  { _id: false }
);

const missionSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    scenario: { type: String, required: true },
    objective: { type: String, required: true },
    ageGroups: [{ type: String }],
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "easy" },
    decisions: [decisionSchema],
    completionCoins: { type: Number, default: 20 },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

const missionAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    missionSlug: { type: String, required: true },
    choices: [
      {
        decisionIndex: Number,
        optionIndex: Number,
        ethicalWeight: Number,
      },
    ],
    score: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    coinsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);
missionAttemptSchema.index({ userId: 1, missionSlug: 1, createdAt: -1 });

const Mission = mongoose.model("Mission", missionSchema);
const MissionAttempt = mongoose.model("MissionAttempt", missionAttemptSchema);

module.exports = { Mission, MissionAttempt };
