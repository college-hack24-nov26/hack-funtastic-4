const express = require("express");
const auth = require("../middleware/authenticate");
const { requireAnyAuth } = require("../middleware/authorize");
const { TeacherChamber } = require("../models/teacherChamber");
const { AshramStage, AshramProgress, Progress } = require("../models/learning");
const { Story, StorySession } = require("../models/story");
const { Mission, MissionAttempt } = require("../models/mission");
const { Quiz, QuizAttempt } = require("../models/quiz");
const { GameDef, GameAttempt } = require("../models/quest");
const { LibraryEntry, Bookmark } = require("../models/library");
const { StudySession } = require("../models/study");
const studentRoutes = require("./student");
const HttpError = require("../utils/httpError");

const router = express.Router();

/* Public content (published only) */
router.get("/ashram/stages", async (req, res, next) => {
  try {
    const stages = await AshramStage.find({ status: "published" }).sort({ order: 1 }).lean();
    res.json({ items: stages });
  } catch (err) { next(err); }
});

router.get("/teacher-chambers", async (req, res, next) => {
  try {
    const chambers = await TeacherChamber.find({ status: "published" }).sort({ name: 1 }).lean();
    res.json({ items: chambers });
  } catch (err) { next(err); }
});

router.get("/teacher-chambers/:slug", async (req, res, next) => {
  try {
    const chamber = await TeacherChamber.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!chamber) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Chamber not found." } });
    res.json({ chamber });
  } catch (err) { next(err); }
});

router.get("/stories", async (req, res, next) => {
  try {
    const q = { status: "published" };
    if (req.query.category) q.category = String(req.query.category);
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    const items = await Story.find(q).select("slug title category summary learningObjectives ageGroups contentKind").lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.get("/missions", async (req, res, next) => {
  try {
    const q = { status: "published" };
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    const items = await Mission.find(q).select("slug title scenario objective ageGroups difficulty completionCoins").lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.get("/games", async (req, res, next) => {
  try {
    const q = { status: "published" };
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    const items = await GameDef.find(q).select("slug title kind description rules ageGroups coinsPerRound").lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.get("/library", async (req, res, next) => {
  try {
    const q = { status: "published" };
    if (req.query.category) q.category = String(req.query.category);
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    if (req.query.search) q.$text = { $search: String(req.query.search) };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 12);
    const [items, total] = await Promise.all([
      LibraryEntry.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select("slug title category tags summary readingMinutes ageGroups").lean(),
      LibraryEntry.countDocuments(q),
    ]);
    res.json({ items, total, page });
  } catch (err) { next(err); }
});

router.get("/library/:slug", async (req, res, next) => {
  try {
    const entry = await LibraryEntry.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!entry) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Article not found." } });
    res.json({ entry });
  } catch (err) { next(err); }
});

router.get("/tests", async (req, res, next) => {
  try {
    const q = { status: "published" };
    if (req.query.subject) q.subject = String(req.query.subject);
    if (req.query.ageGroup) q.ageGroups = String(req.query.ageGroup);
    /* Answer keys are never sent to the browser. */
    const items = await Quiz.find(q).select("slug title subject ageGroups timeLimitSeconds questionCount").lean();
    res.json({ items });
  } catch (err) { next(err); }
});

/* Authenticated student routes follow */

/* ---- Story sessions ---- */
router.get("/story-sessions/:storySlug", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const session = await StorySession.findOne({ userId: req.user.id, storySlug: req.params.storySlug, status: "in-progress" }).lean();
    res.json({ session: session || null });
  } catch (err) { next(err); }
});

router.get("/stories/:slug", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const story = await Story.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!story) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Story not found." } });
    const session = await StorySession.findOne({ userId: req.user.id, storySlug: story.slug, status: "in-progress" }).lean();
    res.json({ story, session: session || null });
  } catch (err) { next(err); }
});

router.post("/story-sessions/:storySlug/choose", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { fromPassageKey, choiceIndex } = req.body || {};
    const story = await Story.findOne({ slug: req.params.storySlug, status: "published" }).lean();
    if (!story) throw new HttpError(404, "NOT_FOUND", "Story not found.");
    const from = story.passages.find((p) => p.key === fromPassageKey);
    if (!from) throw new HttpError(422, "VALIDATION_ERROR", "Unknown passage.");
    const choice = from.choices && from.choices[Number(choiceIndex)];
    if (!choice) throw new HttpError(422, "VALIDATION_ERROR", "Invalid choice.");
    const nextPassage = story.passages.find((p) => p.key === choice.nextPassageKey);
    if (!nextPassage) throw new HttpError(422, "VALIDATION_ERROR", "Broken story branch in dataset.");

    let session = await StorySession.findOne({ userId: req.user.id, storySlug: story.slug, status: "in-progress" });
    if (!session) {
      session = await StorySession.create({ userId: req.user.id, storySlug: story.slug, currentPassageKey: story.startPassageKey });
    }
    session.chosenPath.push(choiceIndex);
    session.currentPassageKey = nextPassage.key;
    session.coinsEarned += choice.reward || 0;
    const completed = nextPassage.isEnding;
    if (completed) session.status = "completed";
    await session.save();

    const coins = choice.reward || 0;
    if (coins > 0) {
      const { recordProgress } = studentRoutes;
      await recordProgress(req.user.id, "story", story.slug, story.title, null, coins, { passage: nextPassage.key });
    }
    if (completed) {
      await studentRoutes.recordProgress(req.user.id, "story", story.slug, story.title, null, 0, { completed: true });
    }
    res.json({
      session: {
        currentPassageKey: session.currentPassageKey,
        chosenPath: session.chosenPath,
        status: session.status,
        coinsEarned: session.coinsEarned,
      },
      passage: nextPassage,
    });
  } catch (err) { next(err); }
});

/* ---- Mission attempts ---- */
router.post("/mission-attempts", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { missionSlug, choices } = req.body || {};
    if (!missionSlug || !Array.isArray(choices)) {
      throw new HttpError(422, "VALIDATION_ERROR", "missionSlug and choices array are required.");
    }
    const mission = await Mission.findOne({ slug: missionSlug, status: "published" }).lean();
    if (!mission) throw new HttpError(404, "NOT_FOUND", "Mission not found.");
    if (choices.length !== mission.decisions.length) {
      throw new HttpError(422, "VALIDATION_ERROR", `Expected ${mission.decisions.length} decisions.`);
    }
    let score = 0;
    const validated = choices.map((c, i) => {
      const opt = mission.decisions[i] && mission.decisions[i].options[Number(c.optionIndex)];
      if (!opt) throw new HttpError(422, "VALIDATION_ERROR", `Invalid choice for decision ${i}.`);
      score += opt.ethicalWeight || 0;
      return { decisionIndex: i, optionIndex: Number(c.optionIndex), ethicalWeight: opt.ethicalWeight || 0 };
    });
    const completed = true;
    const attempt = await MissionAttempt.create({
      userId: req.user.id, missionSlug, choices: validated, score, completed,
      coinsAwarded: mission.completionCoins,
    });
    await studentRoutes.recordProgress(req.user.id, "mission", missionSlug, mission.title, score, mission.completionCoins, { score });
    res.status(201).json({
      attempt: { score: attempt.score, coinsAwarded: attempt.coinsAwarded },
      outcomes: validated.map((v, i) => ({
        outcome: mission.decisions[i].options[v.optionIndex].outcome,
        explanation: mission.decisions[i].options[v.optionIndex].consequenceExplanation,
      })),
    });
  } catch (err) { next(err); }
});

/* ---- Game attempts: server validates submitted answers against the stored question bank ---- */
router.post("/game-attempts", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { gameSlug, answers } = req.body || {};
    if (!gameSlug || !Array.isArray(answers)) {
      throw new HttpError(422, "VALIDATION_ERROR", "gameSlug and answers array are required.");
    }
    const game = await GameDef.findOne({ slug: gameSlug, status: "published" }).lean();
    if (!game) throw new HttpError(404, "NOT_FOUND", "Game not found.");
    const questions = (game.content && game.content.questions) || [];
    if (!questions.length) throw new HttpError(409, "NO_CONTENT", "This game's question bank has not been authored yet.");

    let score = 0;
    const validated = answers.map((a) => {
      const q = questions.find((q) => q.key === a.itemKey);
      if (!q) return { itemKey: a.itemKey, value: a.value, correct: false };
      const correct = Array.isArray(q.accept)
        ? q.accept.includes(String(a.value))
        : String(a.value) === String(q.answer);
      if (correct) score += q.points || 10;
      return { itemKey: a.itemKey, value: a.value, correct };
    });
    const maxScore = questions.reduce((sum, q) => sum + (q.points || 10), 0);
    const coins = score > 0 ? game.coinsPerRound : 0;
    const attempt = await GameAttempt.create({ userId: req.user.id, gameSlug, answers: validated, score, maxScore, coinsAwarded: coins });
    await studentRoutes.recordProgress(req.user.id, "game", gameSlug, game.title, score, coins, { score, maxScore });
    res.status(201).json({ attempt: { score: attempt.score, maxScore: attempt.maxScore, coinsAwarded: attempt.coinsAwarded } });
  } catch (err) { next(err); }
});

/* ---- Quiz/test attempts ---- */
router.get("/tests/:slug", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!quiz) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Test not found." } });
    /* Strip answer keys before sending to the browser. */
    const questions = quiz.questions.map((q) => ({ prompt: q.prompt, options: q.options, points: q.points }));
    res.json({ test: { slug: quiz.slug, title: quiz.title, subject: quiz.subject, timeLimitSeconds: quiz.timeLimitSeconds, questions } });
  } catch (err) { next(err); }
});

router.post("/test-attempts", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { quizSlug, answers } = req.body || {};
    if (!quizSlug || !Array.isArray(answers)) {
      throw new HttpError(422, "VALIDATION_ERROR", "quizSlug and answers array are required.");
    }
    const quiz = await Quiz.findOne({ slug: quizSlug, status: "published" }).lean();
    if (!quiz) throw new HttpError(404, "NOT_FOUND", "Test not found.");
    if (answers.length !== quiz.questions.length) {
      throw new HttpError(422, "VALIDATION_ERROR", `Expected ${quiz.questions.length} answers.`);
    }
    let score = 0;
    let totalPoints = 0;
    const validated = answers.map((a, i) => {
      const q = quiz.questions[i];
      totalPoints += q.points || 10;
      const correct = Number(a.selectedIndex) === q.correctIndex;
      if (correct) score += q.points || 10;
      return { questionIndex: i, selectedIndex: Number(a.selectedIndex), correct };
    });
    const attempt = await QuizAttempt.create({
      userId: req.user.id, quizSlug, answers: validated, score, totalPoints,
      coinsAwarded: score === totalPoints ? 30 : score >= totalPoints / 2 ? 15 : 0,
      completedAt: new Date(),
    });
    await studentRoutes.recordProgress(req.user.id, "test", quizSlug, quiz.title, score, attempt.coinsAwarded, { score, totalPoints });
    res.status(201).json({
      attempt: { score: attempt.score, totalPoints: attempt.totalPoints, coinsAwarded: attempt.coinsAwarded },
      review: quiz.questions.map((q, i) => ({
        prompt: q.prompt, correctIndex: q.correctIndex, selectedIndex: validated[i].selectedIndex,
        correct: validated[i].correct, explanation: q.explanation,
      })),
    });
  } catch (err) { next(err); }
});

/* ---- Library bookmarks ---- */
router.post("/library/:slug/bookmark", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const entry = await LibraryEntry.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Article not found.");
    await Bookmark.updateOne(
      { userId: req.user.id, entrySlug: entry.slug },
      { $setOnInsert: { userId: req.user.id, entrySlug: entry.slug } },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/library-bookmarks", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const bookmarks = await Bookmark.find({ userId: req.user.id }).lean();
    res.json({ items: bookmarks.map((b) => b.entrySlug) });
  } catch (err) { next(err); }
});

/* ---- Study sessions ---- */
router.post("/study-sessions", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const { topicSlug, topicTitle, objectives, practiceCorrect, practiceTotal } = req.body || {};
    if (!topicSlug || !topicTitle) throw new HttpError(422, "VALIDATION_ERROR", "topicSlug and topicTitle are required.");
    const session = await StudySession.create({
      userId: req.user.id, topicSlug, topicTitle,
      objectives: Array.isArray(objectives) ? objectives : [],
      practiceCorrect: Number(practiceCorrect) || 0,
      practiceTotal: Number(practiceTotal) || 0,
      completedAt: new Date(),
    });
    await studentRoutes.recordProgress(req.user.id, "study", topicSlug, topicTitle, null, 10, { sessionId: String(session._id) });
    res.status(201).json({ session: { topicSlug: session.topicSlug, practiceCorrect: session.practiceCorrect, practiceTotal: session.practiceTotal } });
  } catch (err) { next(err); }
});

router.get("/study-sessions", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const sessions = await StudySession.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ items: sessions });
  } catch (err) { next(err); }
});

/* ---- Ashram stage progress ---- */
router.get("/ashram/progress", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const progress = await AshramProgress.find({ userId: req.user.id }).lean();
    res.json({ items: progress });
  } catch (err) { next(err); }
});

router.post("/ashram/stages/:slug/complete", auth.attachUser, requireAnyAuth, async (req, res, next) => {
  try {
    const stage = await AshramStage.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!stage) throw new HttpError(404, "NOT_FOUND", "Stage not found.");
    /* Server-validated: count completed lessons/activities against stage requirements. */
    const done = await Progress.countDocuments({ userId: req.user.id, kind: "lesson" });
    if (done < stage.requiredCount) {
      throw new HttpError(409, "NOT_ELIGIBLE", `Complete ${stage.requiredCount} learning activities first. You have ${done}.`);
    }
    if (stage.unlockAfterStage) {
      const prior = await AshramProgress.findOne({ userId: req.user.id, stageSlug: stage.slug, completedAt: { $ne: null } });
      const priorStage = await AshramStage.findOne({ order: stage.unlockAfterStage }).lean();
      if (priorStage && !prior) {
        const priorProgress = await AshramProgress.findOne({ userId: req.user.id, stageSlug: priorStage.slug, completedAt: { $ne: null } });
        if (!priorProgress) throw new HttpError(409, "LOCKED", `Complete stage ${stage.unlockAfterStage} first.`);
      }
    }
    const updated = await AshramProgress.findOneAndUpdate(
      { userId: req.user.id, stageSlug: stage.slug },
      { $set: { completedAt: new Date(), activityCount: done } },
      { upsert: true, new: true },
    );
    await studentRoutes.recordProgress(req.user.id, "ashram-stage", stage.slug, stage.title, null, stage.rewards ? stage.rewards.coins : 0);
    res.json({ stage: { slug: updated.stageSlug, completedAt: updated.completedAt } });
  } catch (err) { next(err); }
});

module.exports = router;
