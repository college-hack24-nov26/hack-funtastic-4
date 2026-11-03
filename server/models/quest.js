const mongoose = require("mongoose");

/* Quest and challenge definitions */
const questSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: ["quest", "challenge"], default: "quest", index: true },
    ageGroups: [{ type: String }],
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "easy" },
    goal: {
      kind: {
        type: String,
        enum: ["lessons", "stories", "missions", "games", "quests", "library", "study", "test", "specific-activity"],
        required: true,
      },
      refSlug: { type: String, default: null },
      count: { type: Number, default: 1, min: 1 },
    },
    coins: { type: Number, default: 20 },
    unlockAfterQuestSlug: { type: String, default: null },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

/* Claimed reward - unique per user/quest to prevent duplicates */
const questClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    questSlug: { type: String, required: true },
    coinsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);
questClaimSchema.index({ userId: 1, questSlug: 1 }, { unique: true });

/* Player-facing game definitions (12 games) */
const gameDefSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        "knowledge-quiz", "word-match", "timeline", "character-match",
        "memory", "dharma-choice", "loka-explorer", "symbol-recognition",
        "fill-blanks", "sequence-story", "true-false", "mixed-mastery"
      ],
      required: true,
    },
    description: { type: String, required: true },
    rules: { type: String, required: true },
    ageGroups: [{ type: String }],
    content: { type: Object, default: {} }, // questions, pairs, timelines etc
    coinsPerRound: { type: Number, default: 15 },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

const gameAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    gameSlug: { type: String, required: true },
    answers: [{ itemKey: String, value: mongoose.Schema.Types.Mixed, correct: Boolean }],
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    coinsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);
gameAttemptSchema.index({ userId: 1, gameSlug: 1, createdAt: -1 });

const Quest = mongoose.model("Quest", questSchema);
const QuestClaim = mongoose.model("QuestClaim", questClaimSchema);
const GameDef = mongoose.model("GameDef", gameDefSchema);
const GameAttempt = mongoose.model("GameAttempt", gameAttemptSchema);

module.exports = { Quest, QuestClaim, GameDef, GameAttempt };
