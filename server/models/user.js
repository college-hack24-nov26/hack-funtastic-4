const mongoose = require("mongoose");

const AGE_GROUPS = ["6-8", "9-12", "13-15", "16-18", "18+"];

/*
 * USER MODEL - integration boundary.
 * Shared ownership: Kshitij owns the canonical user model. This schema keeps
 * the minimum fields Prathmesh's modules need (identity, role, ageGroup) so
 * the app runs before the shared model lands. When the shared model is
 * available, this file becomes a read adapter over the `users` collection.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    role: {
      type: String,
      enum: ["student", "admin", "guardian", "teacher"],
      default: "student",
      index: true,
    },
    ageGroup: { type: String, enum: AGE_GROUPS, default: "9-12" },
  },
  { timestamps: true, collection: "users" },
);

module.exports = mongoose.model("User", userSchema);
module.exports.AGE_GROUPS = AGE_GROUPS;
module.exports.User = mongoose.model("User");
