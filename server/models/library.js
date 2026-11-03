const mongoose = require("mongoose");
const { AGE_GROUPS } = require("./user");

/*
 * CONTENT MODELS - Lokas, teacher chambers/chapters, ashram-stages are stored in
 * learning.js. This file holds library articles, quests and badges already in
 * rewards.js. Here: LibraryEntry.
 */
const libraryEntrySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, required: true, index: true },
    tags: [{ type: String }],
    summary: { type: String, required: true },
    body: { type: String, required: true },
    readingMinutes: { type: Number, default: 5 },
    ageGroups: [{ type: String, enum: AGE_GROUPS }],
    attribution: { type: String, default: "MythoVerse editorial team" },
    status: { type: String, enum: ["draft", "published", "archived"], default: "published", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

libraryEntrySchema.index({ title: "text", summary: "text", body: "text" });

/* Bookmark of a library entry per user */
const bookmarkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entrySlug: { type: String, required: true },
  },
  { timestamps: true }
);
bookmarkSchema.index({ userId: 1, entrySlug: 1 }, { unique: true });

const LibraryEntry = mongoose.model("LibraryEntry", libraryEntrySchema);
const Bookmark = mongoose.model("Bookmark", bookmarkSchema);

module.exports = { LibraryEntry, Bookmark };
