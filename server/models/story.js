const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    nextPassageKey: { type: String, required: true },
    lesson: { type: String },
    isEnding: { type: Boolean, default: false },
    reward: { type: Number, default: 0 },
  },
  { _id: false }
);

const passageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    text: { type: String, required: true },
    choices: [choiceSchema],
    isEnding: { type: Boolean, default: false },
    reflection: { type: String },
  },
  { _id: false }
);

const storySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, index: true },
    summary: { type: String, required: true },
    learningObjectives: [{ type: String }],
    ageGroups: [{ type: String }],
    passages: [passageSchema],
    startPassageKey: { type: String, default: "start" },
    contentKind: {
      type: String,
      enum: ["traditional", "interpretation", "historical", "scientific", "fiction"],
      default: "fiction",
    },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

storySchema.index({ title: "text", summary: "text" });

/* Student's running session through a story */
const storySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    storySlug: { type: String, required: true },
    currentPassageKey: { type: String, required: true },
    chosenPath: [{ type: String }],
    status: { type: String, enum: ["in-progress", "completed"], default: "in-progress", index: true },
    coinsEarned: { type: Number, default: 0 },
  },
  { timestamps: true }
);
storySessionSchema.index({ userId: 1, storySlug: 1, status: 1 });

const Story = mongoose.model("Story", storySchema);
const StorySession = mongoose.model("StorySession", storySessionSchema);

module.exports = { Story, StorySession };
