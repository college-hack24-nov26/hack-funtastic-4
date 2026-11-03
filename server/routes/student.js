const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authenticate");
const { requireAnyAuth } = require("../middleware/authorize");
const HttpError = require("../utils/httpError");
const Progress = require("../models/learning").Progress;
const { AshramStage, AshramProgress } = require("../models/learning");
const { RewardEntry, Badge, BadgeAward } = require("../models/rewards");
const { StorySession } = require("../models/story");
const { MissionAttempt } = require("../models/mission");
const { QuizAttempt } = require("../models/quiz");
const { GameAttempt, QuestClaim } = require("../models/quest");
const { StudySession } = require("../models/study");

const router = express.Router();

/* Shared: record a learning activity and grant coins server-side. */
async function recordProgress(
  userId,
  kind,
  refSlug,
  title,
  score = null,
  coins = 0,
  meta = {},
) {
  await Progress.findOneAndUpdate(
    { userId, kind, refSlug },
    { $set: { title, score, meta } },
    { upsert: true, new: true },
  );
  if (coins > 0) {
    await RewardEntry.create({
      userId,
      delta: coins,
      reason: `${kind}:${refSlug}`,
      kind,
      refSlug,
    });
  }
  return { coinsAwarded: coins };
}

async function coinBalance(userId) {
  const agg = await RewardEntry.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: "$delta" } } },
  ]);
  return agg.length ? agg[0].total : 0;
}

async function recentActivity(userId, limit = 8) {
  return Progress.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean();
}

async function evaluateBadges(userId) {
  const [progressCount, storyCount, missionCount, gameCount, coins] =
    await Promise.all([
      Progress.countDocuments({ userId, kind: "lesson" }),
      Progress.countDocuments({ userId, kind: "story" }),
      Progress.countDocuments({ userId, kind: "mission" }),
      Progress.countDocuments({ userId, kind: "game" }),
      coinBalance(userId),
    ]);
  const counts = {
    lessons: progressCount,
    stories: storyCount,
    missions: missionCount,
    games: gameCount,
    coins,
  };
  const badges = await Badge.find({ status: "published" }).lean();
  const earned = [];
  for (const badge of badges) {
    const value = counts[badge.rule.type];
    if (value !== undefined && value >= badge.rule.threshold) {
      const res = await BadgeAward.updateOne(
        { userId, badgeSlug: badge.slug },
        { $setOnInsert: { userId, badgeSlug: badge.slug } },
        { upsert: true },
      );
      if (res.upsertedCount) earned.push(badge);
    }
  }
  return earned;
}

/* ---------------- Dashboard ---------------- */
router.get("/student/dashboard", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [
      coins,
      activity,
      ashramDone,
      unlockedLokasCount,
      chamberProgress,
      activeStories,
      missionAttempts,
      quizAttempts,
      gameAttempts,
      quests,
      badges,
    ] = await Promise.all([
      coinBalance(uid),
      recentActivity(uid),
      AshramProgress.countDocuments({
        userId: uid,
        completedAt: { $ne: null },
      }),
      Progress.countDocuments({ userId: uid, kind: "loka" }),
      Progress.countDocuments({ userId: uid, kind: "chamber-chapter" }),
      StorySession.countDocuments({ userId: uid }),
      MissionAttempt.countDocuments({ userId: uid }),
      QuizAttempt.countDocuments({ userId: uid }),
      GameAttempt.countDocuments({ userId: uid }),
      QuestClaim.countDocuments({ userId: uid }),
      BadgeAward.countDocuments({ userId: uid }),
    ]);
    const nextStage = await AshramStage.findOne({
      order: ashramDone + 1,
      status: "published",
    }).lean();
    res.json({
      user: req.user,
      coins,
      ashram: {
        stagesCompleted: ashramDone,
        nextStage: nextStage
          ? { slug: nextStage.slug, title: nextStage.title }
          : null,
      },
      lokasUnlocked: unlockedLokasCount,
      chaptersCompleted: chamberProgress,
      counts: {
        stories: activeStories,
        missions: missionAttempts,
        quizzes: quizAttempts,
        games: gameAttempts,
        quests: quests,
        badges,
      },
      recentActivity: activity,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Student profile / progress ---------------- */
router.get("/student/progress", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const [items, total, coins] = await Promise.all([
      Progress.find({ userId: req.user.id })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Progress.countDocuments({ userId: req.user.id }),
      coinBalance(req.user.id),
    ]);
    res.json({ items, total, page, coins });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Rewards ledger ---------------- */
router.get("/rewards", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const [entries, total, coins, badges] = await Promise.all([
      RewardEntry.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RewardEntry.countDocuments({ userId: req.user.id }),
      coinBalance(req.user.id),
      BadgeAward.find({ userId: req.user.id }).lean(),
    ]);
    res.json({ entries, total, page, coins, badges });
  } catch (err) {
    next(err);
  }
});

/* Claim a quest reward - server validates completion and prevents duplicates. */
router.post("/rewards/claim", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { questSlug } = req.body || {};
    if (!questSlug)
      throw new HttpError(422, "VALIDATION_ERROR", "questSlug is required.");
    const { Quest } = require("../models/quest");
    const quest = await Quest.findOne({
      slug: questSlug,
      status: "published",
    }).lean();
    if (!quest) throw new HttpError(404, "NOT_FOUND", "Quest not found.");

    const existing = await QuestClaim.findOne({
      userId: req.user.id,
      questSlug,
    });
    if (existing)
      throw new HttpError(
        409,
        "ALREADY_CLAIMED",
        "You have already claimed this reward.",
      );

    // Verify completion from authoritative records only.
    let done = 0;
    if (quest.goal.kind === "specific-activity") {
      done = await Progress.countDocuments({
        userId: req.user.id,
        refSlug: quest.goal.refSlug,
      });
    } else if (
      [
        "lessons",
        "stories",
        "missions",
        "games",
        "quests",
        "library",
        "study",
        "test",
      ].includes(quest.goal.kind)
    ) {
      const map = {
        lessons: "lesson",
        stories: "story",
        missions: "mission",
        games: "game",
        quests: "quest",
        library: "library",
        study: "study",
        test: "test",
      };
      done = await Progress.countDocuments({
        userId: req.user.id,
        kind: map[quest.goal.kind],
      });
    } else {
      done = await Progress.countDocuments({
        userId: req.user.id,
        kind: quest.goal.kind,
      });
    }
    if (done < quest.goal.count) {
      throw new HttpError(
        409,
        "NOT_ELIGIBLE",
        `Complete ${quest.goal.count} required ${quest.goal.kind} activity(ies) first. You have ${done}.`,
      );
    }
    if (quest.unlockAfterQuestSlug) {
      const prior = await QuestClaim.findOne({
        userId: req.user.id,
        questSlug: quest.unlockAfterQuestSlug,
      });
      if (!prior)
        throw new HttpError(
          409,
          "LOCKED",
          "Complete the prerequisite quest first.",
        );
    }

    const claim = await QuestClaim.create({
      userId: req.user.id,
      questSlug,
      coinsAwarded: quest.coins,
    });
    await RewardEntry.create({
      userId: req.user.id,
      delta: quest.coins,
      reason: `quest-claim:${questSlug}`,
      kind: "quest",
      refSlug: questSlug,
    });
    res
      .status(201)
      .json({
        claim: { questSlug: claim.questSlug, coinsAwarded: claim.coinsAwarded },
        coins: await coinBalance(req.user.id),
      });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Quests list ---------------- */
router.get("/quests", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { Quest, QuestClaim } = require("../models/quest");
    const quests = await Quest.find({ status: "published" })
      .sort({ title: 1 })
      .lean();
    const claims = await QuestClaim.find({ userId: req.user.id }).lean();
    const claimMap = new Map(claims.map((c) => [c.questSlug, c]));
    const progress = await Progress.find({ userId: req.user.id })
      .select("kind refSlug")
      .lean();
    const progressSet = new Set(progress.map((p) => `${p.kind}:${p.refSlug}`));
    const result = quests.map((q) => {
      let done = 0;
      if (q.goal.kind === "specific-activity") {
        done = [...progressSet].some((k) => k.endsWith(`:${q.goal.refSlug}`))
          ? 1
          : 0;
      } else if (
        [
          "lessons",
          "stories",
          "missions",
          "games",
          "quests",
          "library",
          "study",
          "test",
        ].includes(q.goal.kind)
      ) {
        const map = {
          lessons: "lesson",
          stories: "story",
          missions: "mission",
          games: "game",
          quests: "quest",
          library: "library",
          study: "study",
          test: "test",
        };
        done = progress.filter((p) => p.kind === map[q.goal.kind]).length;
      } else {
        done = progress.filter((p) => p.kind === q.goal.kind).length;
      }
      return {
        slug: q.slug,
        title: q.title,
        description: q.description,
        category: q.category,
        difficulty: q.difficulty,
        coins: q.coins,
        goal: q.goal,
        progress: Math.min(done, q.goal.count),
        claimed: claimMap.has(q.slug),
        locked: !!(
          q.unlockAfterQuestSlug && !claimMap.has(q.unlockAfterQuestSlug)
        ),
        lockReason:
          q.unlockAfterQuestSlug && !claimMap.has(q.unlockAfterQuestSlug)
            ? `Complete quest "${q.unlockAfterQuestSlug}" first.`
            : null,
      };
    });
    res.json({ items: result });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Badge evaluation ---------------- */
router.post("/student/evaluate-badges", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const earned = await evaluateBadges(req.user.id);
    res.json({ earned });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.recordProgress = recordProgress;
module.exports.coinBalance = coinBalance;
