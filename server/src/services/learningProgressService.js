const mongoose = require('mongoose');
const LearningContent = require('../models/learningContent');
const LearningProgress = require('../models/learningProgress');
const studentPointsService = require('./studentPointsService');
const progressionRules = require('../config/progression');

function serviceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function storyLookup(identifier) {
  if (mongoose.isObjectIdOrHexString(identifier)) return { _id: identifier };
  if (typeof identifier === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(identifier)) {
    return { slug: identifier.toLowerCase() };
  }
  throw serviceError('Story identifier must be a valid ID or slug.', 400);
}

function validateSubdocumentIds(chapterId, lessonId) {
  if (!mongoose.isObjectIdOrHexString(chapterId) || !mongoose.isObjectIdOrHexString(lessonId)) {
    throw serviceError('Chapter and lesson identifiers must be valid IDs.', 400);
  }
}

async function findAvailableStory(identifier, ageGroup) {
  const filter = {
    ...storyLookup(identifier),
    moduleType: 'story',
    publicationStatus: 'published'
  };
  if (ageGroup) filter.ageGroups = ageGroup;
  const story = await LearningContent.findOne(filter);
  if (!story) throw serviceError('Story not found.', 404);
  return story;
}

function getLesson(story, chapterId, lessonId) {
  const chapter = story.chapters.id(chapterId);
  if (!chapter) throw serviceError('Chapter not found.', 404);
  const lesson = chapter.lessons.id(lessonId);
  if (!lesson) throw serviceError('Lesson not found.', 404);
  return { chapter, lesson };
}

function flattenLessons(story) {
  return story.chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((chapter) => chapter.lessons
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((lesson) => ({ chapter, lesson })));
}

function completedKey(chapterId, lessonId) {
  return `${chapterId.toString()}:${lessonId.toString()}`;
}

function serializeStoryProgress(story, progress) {
  const lessons = flattenLessons(story);
  const validKeys = new Set(lessons.map(({ chapter, lesson }) => completedKey(chapter._id, lesson._id)));
  const completedLessonKeys = (progress?.completedLessons || [])
    .filter((entry) => validKeys.has(completedKey(entry.chapterId, entry.lessonId)))
    .map((entry) => completedKey(entry.chapterId, entry.lessonId));
  const completedUnique = [...new Set(completedLessonKeys)];
  return {
    story: { id: story._id.toString(), slug: story.slug, title: story.title },
    progress: {
      started: Boolean(progress?.lastAccessedLessonId),
      completedLessons: completedUnique.length,
      totalLessons: lessons.length,
      percentage: lessons.length ? Math.round((completedUnique.length / lessons.length) * 100) : 0,
      completedLessonKeys: completedUnique,
      lastAccessed: progress?.lastAccessedLessonId && progress?.lastAccessedAt
        ? {
            chapterId: progress.lastAccessedChapterId.toString(),
            lessonId: progress.lastAccessedLessonId.toString(),
            accessedAt: progress.lastAccessedAt
          }
        : null
    }
  };
}

async function ensureProgress(studentId, storyId) {
  try {
    return await LearningProgress.findOneAndUpdate(
      { student: studentId, story: storyId },
      { $setOnInsert: { student: studentId, story: storyId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return LearningProgress.findOne({ student: studentId, story: storyId });
  }
}

async function getStoryProgress(studentId, ageGroup, identifier) {
  const story = await findAvailableStory(identifier, ageGroup);
  const progress = await LearningProgress.findOne({ student: studentId, story: story._id });
  return serializeStoryProgress(story, progress);
}

async function recordLessonAccess(studentId, ageGroup, identifier, chapterId, lessonId) {
  validateSubdocumentIds(chapterId, lessonId);
  const story = await findAvailableStory(identifier, ageGroup);
  getLesson(story, chapterId, lessonId);
  const accessedAt = new Date();
  await LearningProgress.updateOne(
    { student: studentId, story: story._id },
    {
      $set: { lastAccessedChapterId: chapterId, lastAccessedLessonId: lessonId, lastAccessedAt: accessedAt },
      $setOnInsert: { student: studentId, story: story._id }
    },
    { upsert: true }
  ).catch(async (error) => {
    if (error.code !== 11000) throw error;
    await LearningProgress.updateOne(
      { student: studentId, story: story._id },
      { $set: { lastAccessedChapterId: chapterId, lastAccessedLessonId: lessonId, lastAccessedAt: accessedAt } }
    );
  });
  const progress = await LearningProgress.findOne({ student: studentId, story: story._id });
  return serializeStoryProgress(story, progress);
}

async function completeLesson(studentId, ageGroup, identifier, chapterId, lessonId) {
  validateSubdocumentIds(chapterId, lessonId);
  const story = await findAvailableStory(identifier, ageGroup);
  getLesson(story, chapterId, lessonId);
  await ensureProgress(studentId, story._id);
  const completedAt = new Date();
  const priorAccess = await LearningProgress.findOne({
    student: studentId, story: story._id,
    lastAccessedChapterId: chapterId, lastAccessedLessonId: lessonId
  }).select('lastAccessedAt').lean();
  const existingCompletion = {
    chapterId: new mongoose.Types.ObjectId(chapterId),
    lessonId: new mongoose.Types.ObjectId(lessonId)
  };
  const completionFilter = {
    student: studentId,
    story: story._id,
    completedLessons: { $not: { $elemMatch: existingCompletion } }
  };
  const update = {
    $push: { completedLessons: { ...existingCompletion, completedAt } },
    $set: { lastAccessedChapterId: chapterId, lastAccessedLessonId: lessonId, lastAccessedAt: completedAt }
  };
  const result = await LearningProgress.updateOne(completionFilter, update);
  if (!result.matchedCount) {
    await LearningProgress.updateOne(
      { student: studentId, story: story._id },
      { $set: { lastAccessedChapterId: chapterId, lastAccessedLessonId: lessonId, lastAccessedAt: completedAt } }
    );
  }
  let dharmaPointsAwarded = 0;
  const studyTimeMs = priorAccess?.lastAccessedAt ? completedAt.getTime() - new Date(priorAccess.lastAccessedAt).getTime() : 0;
  if (result.matchedCount === 1 && studyTimeMs >= progressionRules.lessonMinimumStudySeconds * 1000) {
    const reward = await studentPointsService.applyChoice(studentId, {
      eventKey: `story-lesson:${story._id}:${chapterId}:${lessonId}:dharma`, dharmaChange: progressionRules.lessonCompletionDharma
    });
    if (reward.applied) dharmaPointsAwarded = progressionRules.lessonCompletionDharma;
  }
  const progress = await LearningProgress.findOne({ student: studentId, story: story._id });
  return { ...serializeStoryProgress(story, progress), dharmaPointsAwarded };
}

function serializeContinueLearning(progress, story) {
  if (!progress?.lastAccessedChapterId || !progress?.lastAccessedLessonId) return null;
  const chapter = story.chapters.id(progress.lastAccessedChapterId);
  const lesson = chapter?.lessons.id(progress.lastAccessedLessonId);
  if (!chapter || !lesson) return null;
  const orderedLessons = flattenLessons(story);
  const currentIndex = orderedLessons.findIndex(({ lesson: item }) => item._id.equals(lesson._id));
  const completedKeys = new Set(serializeStoryProgress(story, progress).progress.completedLessonKeys);
  const currentLessonCompleted = completedKeys.has(completedKey(chapter._id, lesson._id));
  const nextLesson = currentIndex >= 0 && currentIndex + 1 < orderedLessons.length
    ? {
        chapterId: orderedLessons[currentIndex + 1].chapter._id.toString(),
        lessonId: orderedLessons[currentIndex + 1].lesson._id.toString()
      }
    : null;
  const allCompleted = orderedLessons.length > 0 && orderedLessons.every(({ chapter: itemChapter, lesson: itemLesson }) =>
    completedKeys.has(completedKey(itemChapter._id, itemLesson._id)));
  return {
    story: { id: story._id.toString(), slug: story.slug, title: story.title },
    chapter: { id: chapter._id.toString(), title: chapter.title },
    lesson: { id: lesson._id.toString(), title: lesson.title },
    accessedAt: progress.lastAccessedAt,
    lastLessonCompleted: currentLessonCompleted,
    allLessonsCompleted: allCompleted,
    nextLesson
  };
}

async function findLastAccessed(studentId, ageGroup) {
  const stories = await LearningContent.find({
    moduleType: 'story',
    publicationStatus: 'published',
    ...(ageGroup ? { ageGroups: ageGroup } : {})
  }).select('title slug chapters._id chapters.title chapters.lessons._id chapters.lessons.title');
  if (!stories.length) return null;
  const storyById = new Map(stories.map((story) => [story._id.toString(), story]));
  const progress = await LearningProgress.findOne({
    student: studentId,
    story: { $in: stories.map((story) => story._id) },
    lastAccessedAt: { $ne: null }
  })
    .sort({ lastAccessedAt: -1 })
    .exec();
  if (!progress) return null;
  return serializeContinueLearning(progress, storyById.get(progress.story.toString()));
}

async function getLastAccessed(studentId, ageGroup) {
  return { continueLearning: await findLastAccessed(studentId, ageGroup) };
}

async function getProgressSummary(studentId, ageGroup) {
  const storyFilter = {
    moduleType: 'story',
    publicationStatus: 'published',
    ...(ageGroup ? { ageGroups: ageGroup } : {})
  };
  const stories = await LearningContent.find(storyFilter)
    .select('title slug chapters._id chapters.title chapters.lessons._id chapters.lessons.title')
    .lean();
  const storyIds = stories.map((story) => story._id);
  const progressRecords = storyIds.length
    ? await LearningProgress.find({ student: studentId, story: { $in: storyIds } })
    : [];
  const progressByStory = new Map(progressRecords.map((record) => [record.story.toString(), record]));
  const totalLessons = stories.reduce((total, story) => total + story.chapters.reduce((chapterTotal, chapter) =>
    chapterTotal + chapter.lessons.length, 0), 0);
  let completedLessons = 0;
  let startedStories = 0;
  for (const story of stories) {
    const record = progressByStory.get(story._id.toString());
    if (!record) continue;
    if (record.lastAccessedLessonId) startedStories += 1;
    const keys = new Set();
    for (const chapter of story.chapters) {
      for (const lesson of chapter.lessons) keys.add(completedKey(chapter._id, lesson._id));
    }
    const completed = new Set((record.completedLessons || [])
      .map((entry) => completedKey(entry.chapterId, entry.lessonId))
      .filter((key) => keys.has(key)));
    completedLessons += completed.size;
  }
  const continueLearning = await findLastAccessed(studentId, ageGroup);
  return {
    summary: {
      availableStories: stories.length,
      startedStories,
      completedLessons,
      totalLessons,
      percentage: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
    },
    continueLearning
  };
}

module.exports = {
  completeLesson,
  getLastAccessed,
  getProgressSummary,
  getStoryProgress,
  recordLessonAccess
};
