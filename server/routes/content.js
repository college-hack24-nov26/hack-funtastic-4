const express = require("express");
const { Video } = require("../models/video");

const router = express.Router();

/* Public (students browse published videos). Admin CRUD lives in admin routes. */
router.get("/videos", async (req, res, next) => {
  try {
    const q = {};
    if (req.query.subject) q.subject = String(req.query.subject);
    if (req.query.teacherSlug) q.teacherSlug = String(req.query.teacherSlug);
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    if (req.query.search) {
      q.$text = { $search: String(req.query.search) };
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const [items, total] = await Promise.all([
      Video.find({ ...q, status: "published" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("slug title description subject teacherSlug ageGroups durationSeconds language sourceUrl storageRef createdAt")
        .lean(),
      Video.countDocuments({ ...q, status: "published" }),
    ]);
    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get("/videos/:slug", async (req, res, next) => {
  try {
    const video = await Video.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!video) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Video not found or not published." } });
    }
    res.json({ video });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
