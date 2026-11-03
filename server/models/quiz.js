const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctIndex: { type: Number, required: true },
    explanation: { type: String },
    points: { type: Number, default: 10 },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    subject: { type: String, index: true },
    ageGroups: [{ type: String }],
    questions: [questionSchema],
    timeLimitSeconds: { type: Number, default: 300 },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    quizSlug: { type: String, required: true },
    answers: [{ questionIndex: Number, selectedIndex: Number, correct: Boolean }],
    score: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    coinsAwarded: { type: Number, default: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);
quizAttemptSchema.index({ userId: 1, quizSlug: 1, createdAt: -1 });

const Quiz = mongoose.model("Quiz", quizSchema);
const QuizAttempt = mongoose.model("QuizAttempt", quizAttemptSchema);

module.exports = { Quiz, QuizAttempt };
