const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    title: { type: String, required: true },
    objectives: [{ type: String }],
    body: { type: String, required: true },
    contentKind: {
      type: String,
      enum: ["traditional", "interpretation", "historical", "scientific", "fiction"],
      default: "traditional",
    },
    quiz: [
      {
        question: { type: String, required: true },
        options: [{ type: String }],
        correctIndex: { type: Number, required: true },
        explanation: { type: String },
      },
    ],
    order: { type: Number, default: 1 },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published" },
  },
  { _id: false }
);

const teacherChamberSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tradition: { type: String, default: null },
    description: { type: String, required: true },
    ageGroups: [{ type: String }],
    chapters: [chapterSchema],
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
  },
  { timestamps: true }
);

module.exports = { TeacherChamber: mongoose.model("TeacherChamber", teacherChamberSchema) };
