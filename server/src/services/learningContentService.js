const mongoose = require('mongoose');
const LearningContent = require('../models/learningContent');

const STORY_EDITABLE_FIELDS = [
  'title', 'slug', 'shortDescription', 'fullDescription', 'mythologicalBackground',
  'coverImage', 'category', 'ageGroups', 'difficulty', 'learningObjectives',
  'estimatedMinutes'
];
const CHAPTER_FIELDS = ['title', 'summary', 'order', 'estimatedMinutes', 'lessons'];
const CHAPTER_EDITABLE_FIELDS = ['title', 'summary', 'order', 'estimatedMinutes'];
const LESSON_FIELDS = ['title', 'order', 'content', 'contentFormat', 'learningObjectives', 'estimatedMinutes'];

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handlePersistenceError(error) {
  if (error.code === 11000) return httpError('A story with this slug already exists.', 409);
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return httpError(error.message, 400);
  }
  return error;
}

async function safely(action) {
  try {
    return await action();
  } catch (error) {
    throw handlePersistenceError(error);
  }
}

function identifierFilter(identifier) {
  return mongoose.isObjectIdOrHexString(identifier)
    ? { _id: identifier }
    : { slug: identifier.toLowerCase() };
}

function storyFilter(identifier) {
  return { ...identifierFilter(identifier), moduleType: 'story' };
}

async function findStory(identifier, { publishedOnly = false } = {}) {
  const filter = storyFilter(identifier);
  if (publishedOnly) filter.publicationStatus = 'published';
  const story = await LearningContent.findOne(filter);
  if (!story) throw httpError('Story not found.', 404);
  return story;
}

function serializeStory(story) {
  return story.toObject({ versionKey: false });
}

async function listPublishedStories(query) {
  return safely(async () => {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const filter = { moduleType: 'story', publicationStatus: 'published' };
    if (query.ageGroup) filter.ageGroups = query.ageGroup;
    if (query.category) filter.category = query.category.trim();
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.search) {
      const escapedSearch = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escapedSearch, $options: 'i' };
    }

    const [stories, total] = await Promise.all([
      LearningContent.find(filter)
        .select('title slug shortDescription coverImage category ageGroups difficulty learningObjectives estimatedMinutes updatedAt')
        .sort({ updatedAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LearningContent.countDocuments(filter)
    ]);

    return {
      stories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  });
}

async function getPublishedStory(identifier) {
  return safely(async () => ({ story: serializeStory(await findStory(identifier, { publishedOnly: true })) }));
}

async function getPublishedChapters(identifier) {
  return safely(async () => {
    const story = await findStory(identifier, { publishedOnly: true });
    const chapters = story.chapters
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((chapter) => ({
        _id: chapter._id,
        title: chapter.title,
        summary: chapter.summary,
        order: chapter.order,
        estimatedMinutes: chapter.estimatedMinutes,
        lessons: chapter.lessons.map((lesson) => ({
          _id: lesson._id,
          title: lesson.title,
          order: lesson.order,
          estimatedMinutes: lesson.estimatedMinutes
        }))
      }));
    return { story: { id: story._id, title: story.title, slug: story.slug }, chapters };
  });
}

async function getPublishedLessons(identifier, chapterId) {
  return safely(async () => {
    const story = await findStory(identifier, { publishedOnly: true });
    const chapter = story.chapters.id(chapterId);
    if (!chapter) throw httpError('Chapter not found.', 404);
    const lessons = chapter.lessons
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((lesson) => lesson.toObject({ versionKey: false }));
    return { story: { id: story._id, title: story.title, slug: story.slug }, chapter: { id: chapter._id, title: chapter.title }, lessons };
  });
}

async function getAdminStory(identifier) {
  return safely(async () => ({ story: serializeStory(await findStory(identifier)) }));
}

async function listAdminStories(query) {
  return safely(async () => {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const filter = { moduleType: 'story' };
    if (query.status && query.status !== 'all') filter.publicationStatus = query.status;
    if (query.search) {
      const escapedSearch = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { slug: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    const [stories, filteredTotal, total, published, draft] = await Promise.all([
      LearningContent.find(filter)
        .select('title slug shortDescription category ageGroups difficulty estimatedMinutes publicationStatus updatedAt')
        .sort({ updatedAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LearningContent.countDocuments(filter),
      LearningContent.countDocuments({ moduleType: 'story' }),
      LearningContent.countDocuments({ moduleType: 'story', publicationStatus: 'published' }),
      LearningContent.countDocuments({ moduleType: 'story', publicationStatus: 'draft' })
    ]);

    return {
      stories,
      pagination: { page, limit, total: filteredTotal, pages: Math.ceil(filteredTotal / limit) },
      stats: { total, published, draft }
    };
  });
}

async function createStory(input) {
  return safely(async () => {
    const story = await LearningContent.create({ ...input, moduleType: 'story', publicationStatus: 'draft' });
    return { story: serializeStory(story) };
  });
}

async function updateStory(identifier, input) {
  return safely(async () => {
    const story = await findStory(identifier);
    for (const field of STORY_EDITABLE_FIELDS) {
      if (field in input) story.set(field, input[field]);
    }
    await story.save();
    return { story: serializeStory(story) };
  });
}

async function setStoryPublication(identifier, publicationStatus) {
  return safely(async () => {
    if (!['draft', 'published'].includes(publicationStatus)) {
      throw httpError('Publication status must be draft or published.', 400);
    }
    const story = await findStory(identifier);
    story.publicationStatus = publicationStatus;
    await story.save();
    return { story: serializeStory(story) };
  });
}

async function addChapter(identifier, input) {
  return safely(async () => {
    const story = await findStory(identifier);
    const chapter = {};
    for (const field of CHAPTER_FIELDS) {
      if (field in input) chapter[field] = input[field];
    }
    story.chapters.push(chapter);
    await story.save();
    return { story: serializeStory(story), chapter: story.chapters[story.chapters.length - 1].toObject({ versionKey: false }) };
  });
}

async function updateChapter(identifier, chapterId, input) {
  return safely(async () => {
    const story = await findStory(identifier);
    const chapter = story.chapters.id(chapterId);
    if (!chapter) throw httpError('Chapter not found.', 404);
    for (const field of CHAPTER_EDITABLE_FIELDS) {
      if (field in input) chapter.set(field, input[field]);
    }
    await story.save();
    return { story: serializeStory(story), chapter: chapter.toObject({ versionKey: false }) };
  });
}

async function addLesson(identifier, chapterId, input) {
  return safely(async () => {
    const story = await findStory(identifier);
    const chapter = story.chapters.id(chapterId);
    if (!chapter) throw httpError('Chapter not found.', 404);
    const lesson = {};
    for (const field of LESSON_FIELDS) {
      if (field in input) lesson[field] = input[field];
    }
    chapter.lessons.push(lesson);
    await story.save();
    return { story: serializeStory(story), lesson: chapter.lessons[chapter.lessons.length - 1].toObject({ versionKey: false }) };
  });
}

async function updateLesson(identifier, chapterId, lessonId, input) {
  return safely(async () => {
    const story = await findStory(identifier);
    const chapter = story.chapters.id(chapterId);
    if (!chapter) throw httpError('Chapter not found.', 404);
    const lesson = chapter.lessons.id(lessonId);
    if (!lesson) throw httpError('Lesson not found.', 404);
    for (const field of LESSON_FIELDS) {
      if (field in input) lesson.set(field, input[field]);
    }
    await story.save();
    return { story: serializeStory(story), lesson: lesson.toObject({ versionKey: false }) };
  });
}

module.exports = {
  addChapter,
  addLesson,
  createStory,
  getAdminStory,
  listAdminStories,
  getPublishedChapters,
  getPublishedLessons,
  getPublishedStory,
  listPublishedStories,
  setStoryPublication,
  updateLesson,
  updateChapter,
  updateStory
};
