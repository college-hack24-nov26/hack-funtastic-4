const mongoose = require("mongoose");
const { AGE_GROUPS } = require("./user");

/* Video Learning - metadata records now, real assets supplied later */
const videoSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    subject: { type: String, index: true },
    teacherSlug: { type: String, default: null, index: true },
    chapterSlug: { type: String, default: null },
    lessonSlug: { type: String, default: null },
    ageGroups: [{ type: String, enum: AGE_GROUPS }],
    durationSeconds: { type: Number, default: null },
    language: { type: String, default: "English" },
    /* Real asset reference - must be a validated URL when present */
    sourceUrl: {
      type: String,
      default: null,
      validate: {
        validator: (v) =>
          v === null || /^https?:\/\/[^\s]+$/.test(v),
        message: "sourceUrl must be a valid http(s) URL.",
      },
    },
    storageRef: { type: String, default: null }, // future local/managed storage path
    transcript: { type: String, default: null },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  },
  { timestamps: true }
);

videoSchema.index({ title: "text", description: "text", subject: "text" });

/* True only when a playable asset reference exists */
videoSchema.virtual("isPlayable").get(function () {
  return Boolean(this.sourceUrl || this.storageRef);
});
videoSchema.set("toJSON", { virtuals: true });

module.exports = { Video: mongoose.model("Video", videoSchema) };
