const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/authenticate");
const { requireAdmin, requireAnyAuth } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const HttpError = require("../utils/httpError");
const { AuditLog, AiConfig } = require("../models/study");
const User = require("../models/user");
const { Video } = require("../models/video");
const { LibraryEntry } = require("../models/library");
const { Story } = require("../models/story");
const { Mission } = require("../models/mission");
const { Quiz } = require("../models/quiz");
const { Quest, GameDef } = require("../models/quest");
const { TeacherChamber } = require("../models/teacherChamber");
const { AshramStage } = require("../models/learning");

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

/* Every admin route requires authentication first, then the admin role. */
router.use(["/content", "/audit", "/ai-config", "/stats"], auth.attachUser, requireAnyAuth, adminLimiter, requireAdmin);

async function audit(req, action, targetType, targetId, detail = {}) {
  try {
    await AuditLog.create({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action,
      targetType,
      targetId,
      detail,
    });
  } catch (err) {
    console.error("[admin] audit log failed:", err.message);
  }
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

/*
 * Generic content registry: model + editable fields per content type.
 * Editing is restricted to the whitelisted fields so clients cannot
 * modify protected fields like status or revision history directly.
 */
const CONTENT_TYPES = {
  video: { model: Video, label: "Video" },
  library: { model: LibraryEntry, label: "Library entry" },
  story: { model: Story, label: "Story" },
  mission: { model: Mission, label: "Mission" },
  quiz: { model: Quiz, label: "Quiz" },
  quest: { model: Quest, label: "Quest" },
  game: { model: GameDef, label: "Game" },
  chamber: { model: TeacherChamber, label: "Teacher chamber" },
  "ashram-stage": { model: AshramStage, label: "Ashram stage" },
};

/* Field whitelist per content type - everything else is rejected. */
const EDITABLE_FIELDS = {
  video: ["title", "description", "subject", "teacherSlug", "chapterSlug", "lessonSlug", "ageGroups", "durationSeconds", "language", "sourceUrl", "storageRef", "transcript", "status"],
  library: ["title", "category", "tags", "summary", "body", "readingMinutes", "ageGroups", "attribution", "status"],
  story: ["title", "category", "summary", "learningObjectives", "ageGroups", "passages", "startPassageKey", "contentKind", "status"],
  mission: ["title", "scenario", "objective", "ageGroups", "difficulty", "decisions", "completionCoins", "status"],
  quiz: ["title", "subject", "ageGroups", "questions", "timeLimitSeconds", "status"],
  quest: ["title", "description", "category", "ageGroups", "difficulty", "goal", "coins", "unlockAfterQuestSlug", "status"],
  game: ["title", "kind", "description", "rules", "ageGroups", "content", "coinsPerRound", "status"],
  chamber: ["name", "tradition", "description", "ageGroups", "chapters", "status"],
  "ashram-stage": ["order", "title", "purpose", "description", "requiredActivities", "requiredCount", "unlockAfterStage", "ageGroups", "rewards", "status"],
};

function pickEditable(type, body) {
  const allowed = EDITABLE_FIELDS[type] || [];
  const clean = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      clean[field] = body[field];
    }
  }
  return clean;
}

/* ---- List content ---- */
router.get("/content/:type", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const q = {};
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.search) q.$text = { $search: String(req.query.search) };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const [items, total] = await Promise.all([
      entry.model.find(q).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      entry.model.countDocuments(q),
    ]);
    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

/* ---- Create draft ---- */
router.post("/content/:type", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const body = req.body || {};
    if (body.slug && !SLUG_PATTERN.test(body.slug)) {
      throw new HttpError(422, "VALIDATION_ERROR", "slug must be lowercase letters, numbers and hyphens.");
    }
    if (!body.slug) {
      throw new HttpError(422, "VALIDATION_ERROR", "slug is required.");
    }
    const clean = pickEditable(req.params.type, body);
    if (clean.status && clean.status !== "draft") {
      throw new HttpError(422, "VALIDATION_ERROR", "New content must start as a draft. Use the publish action after review.");
    }
    const doc = await entry.model.create({ ...body, ...clean, status: "draft" });
    await audit(req, "content.create", req.params.type, doc.slug, { title: doc.title });
    res.status(201).json({ item: doc });
  } catch (err) {
    next(err);
  }
});

/* ---- Update ---- */
router.put("/content/:type/:slug", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const clean = pickEditable(req.params.type, req.body || {});
    if (!Object.keys(clean).length) {
      throw new HttpError(422, "VALIDATION_ERROR", "No editable fields supplied.");
    }
    const doc = await entry.model.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: clean },
      { new: true, runValidators: true },
    );
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.update", req.params.type, doc.slug, { fields: Object.keys(clean) });
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
});

/* ---- Publish / unpublish ---- */
router.post("/content/:type/:slug/publish", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const doc = await entry.model.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { status: "published" } },
      { new: true, runValidators: true },
    );
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.publish", req.params.type, doc.slug);
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
});

router.post("/content/:type/:slug/unpublish", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const doc = await entry.model.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { status: "draft" } },
      { new: true, runValidators: true },
    );
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.unpublish", req.params.type, doc.slug);
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
});

/* ---- Archive / restore ---- */
router.post("/content/:type/:slug/archive", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const doc = await entry.model.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { status: "archived" } },
      { new: true, runValidators: true },
    );
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.archive", req.params.type, doc.slug);
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
});

router.post("/content/:type/:slug/restore", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const doc = await entry.model.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { status: "draft" } },
      { new: true, runValidators: true },
    );
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.restore", req.params.type, doc.slug);
    res.json({ item: doc });
  } catch (err) {
    next(err);
  }
});

/* ---- Delete (admin only, audited) ---- */
router.delete("/content/:type/:slug", async (req, res, next) => {
  try {
    const entry = CONTENT_TYPES[req.params.type];
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Unknown content type.");
    const doc = await entry.model.findOneAndDelete({ slug: req.params.slug });
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Record not found.");
    await audit(req, "content.delete", req.params.type, req.params.slug, { title: doc.title });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---- Audit log view ---- */
router.get("/audit", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const [items, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(),
    ]);
    res.json({ items, total, page });
  } catch (err) {
    next(err);
  }
});

/* ---- AI / Debate configuration (Sahil contract) ---- */
router.get("/ai-config", async (req, res, next) => {
  try {
    let config = await AiConfig.findOne({ key: "global" }).lean();
    if (!config) {
      config = await AiConfig.create({ key: "global" });
    }
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

router.put("/ai-config", async (req, res, next) => {
  try {
    const clean = validate(req.body || {}, {
      aiEnabled: { type: "boolean" },
      debateEnabled: { type: "boolean" },
      moderationLevel: { type: "string", enum: ["strict", "standard", "relaxed"] },
      promptVersion: { type: "string", max: 20 },
    });
    if (!Object.keys(clean).length) {
      throw new HttpError(422, "VALIDATION_ERROR", "No configuration fields supplied.");
    }
    const config = await AiConfig.findOneAndUpdate(
      { key: "global" },
      { $set: { ...clean, updatedAtBy: req.user.id } },
      { upsert: true, new: true, runValidators: true },
    );
    await audit(req, "ai-config.update", "ai-config", "global", { fields: Object.keys(clean) });
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

/* ---- Platform statistics ---- */
router.get("/stats", async (req, res, next) => {
  try {
    const [students, admins, videos, library, stories, missions, quizzes, quests, games, chambers, ashramStages] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "admin" }),
      Video.countDocuments(),
      LibraryEntry.countDocuments(),
      Story.countDocuments(),
      Mission.countDocuments(),
      Quiz.countDocuments(),
      Quest.countDocuments(),
      GameDef.countDocuments(),
      TeacherChamber.countDocuments(),
      AshramStage.countDocuments(),
    ]);
    res.json({
      students, admins, videos, library, stories, missions,
      quizzes, quests, games, chambers, ashramStages,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
