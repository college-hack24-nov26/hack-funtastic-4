const mongoose = require('mongoose');
const LearningContent = require('../models/learningContent');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateIdentifier(request, response, next) {
  const value = request.params.identifier;
  if (!mongoose.isObjectIdOrHexString(value) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value || '')) {
    return next(badRequest('Story identifier must be a valid ID or slug.'));
  }
  return next();
}

function validateSubdocumentIds(request, response, next) {
  for (const key of ['chapterId', 'lessonId']) {
    if (request.params[key] && !mongoose.isObjectIdOrHexString(request.params[key])) {
      return next(badRequest(`${key} must be a valid identifier.`));
    }
  }
  return next();
}

function validateStoryQuery(request, response, next) {
  const allowed = new Set(['ageGroup', 'category', 'difficulty', 'search', 'page', 'limit']);
  const unknown = Object.keys(request.query).find((key) => !allowed.has(key));
  if (unknown) return next(badRequest(`Unsupported query parameter: ${unknown}.`));

  const { ageGroup, category, difficulty, search, page, limit } = request.query;
  if (ageGroup && !LearningContent.AGE_GROUPS.includes(ageGroup)) {
    return next(badRequest('Choose a supported age group.'));
  }
  if (category !== undefined && (typeof category !== 'string' || !category.trim() || category.length > 80)) {
    return next(badRequest('Category must be between 1 and 80 characters.'));
  }
  if (difficulty !== undefined && !LearningContent.DIFFICULTY_LEVELS.includes(difficulty)) {
    return next(badRequest('Choose a supported difficulty level.'));
  }
  if (search !== undefined && (typeof search !== 'string' || search.trim().length > 100)) {
    return next(badRequest('Search must be 100 characters or fewer.'));
  }
  for (const [name, value, maximum] of [['page', page, 100000], ['limit', limit, 100]]) {
    if (value === undefined) continue;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
      return next(badRequest(`${name} must be an integer between 1 and ${maximum}.`));
    }
  }
  return next();
}

function validateAdminStoryQuery(request, response, next) {
  const allowed = new Set(['status', 'search', 'page', 'limit']);
  const unknown = Object.keys(request.query).find((key) => !allowed.has(key));
  if (unknown) return next(badRequest(`Unsupported query parameter: ${unknown}.`));

  const { status, search, page, limit } = request.query;
  if (status !== undefined && !['all', 'draft', 'published', 'archived'].includes(status)) {
    return next(badRequest('Choose a supported publication status.'));
  }
  if (search !== undefined && (typeof search !== 'string' || search.trim().length > 100)) {
    return next(badRequest('Search must be 100 characters or fewer.'));
  }
  for (const [name, value, maximum] of [['page', page, 100000], ['limit', limit, 100]]) {
    if (value === undefined) continue;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
      return next(badRequest(`${name} must be an integer between 1 and ${maximum}.`));
    }
  }
  return next();
}

function ensureObjectBody(request) {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw badRequest('A JSON object is required.');
  }
}

function validateKnownFields(request, response, next, fields, { required = [], allowEmpty = false } = {}) {
  try {
    ensureObjectBody(request);
    const keys = Object.keys(request.body);
    if (!keys.length && !allowEmpty) throw badRequest('Provide at least one field.');
    const unsupported = keys.find((key) => !fields.includes(key));
    if (unsupported) throw badRequest(`Unsupported field: ${unsupported}.`);
    const missing = required.find((key) => !(key in request.body));
    if (missing) throw badRequest(`${missing} is required.`);
    return next();
  } catch (error) {
    return next(error);
  }
}

const STORY_FIELDS = [
  'title', 'slug', 'shortDescription', 'fullDescription', 'mythologicalBackground',
  'coverImage', 'category', 'ageGroups', 'difficulty', 'learningObjectives',
  'estimatedMinutes', 'publicationStatus'
];
const STORY_UPDATE_FIELDS = STORY_FIELDS.filter((field) => field !== 'publicationStatus');
const CREATE_STORY_FIELDS = [...STORY_UPDATE_FIELDS, 'chapters'];

function validateCreateStory(request, response, next) {
  const required = [
    'title', 'slug', 'shortDescription', 'fullDescription', 'mythologicalBackground',
    'category', 'ageGroups', 'difficulty', 'learningObjectives', 'estimatedMinutes'
  ];
  try {
    ensureObjectBody(request);
    const keys = Object.keys(request.body);
    const unsupported = keys.find((key) => !CREATE_STORY_FIELDS.includes(key));
    if (unsupported) throw badRequest(`Unsupported field: ${unsupported}.`);
    const missing = required.find((key) => !(key in request.body));
    if (missing) throw badRequest(`${missing} is required.`);
    const candidate = new LearningContent({ ...request.body, moduleType: 'story' });
    candidate.validate().then(() => next()).catch((error) => next(badRequest(error.message)));
  } catch (error) {
    return next(error);
  }
}

function validateChapter(request, response, next) {
  const allowed = ['title', 'summary', 'order', 'estimatedMinutes', 'lessons'];
  return validateKnownFields(request, response, next, allowed);
}

function validateChapterUpdate(request, response, next) {
  const allowed = ['title', 'summary', 'order', 'estimatedMinutes'];
  return validateKnownFields(request, response, next, allowed);
}

function validateLesson(request, response, next) {
  const allowed = ['title', 'order', 'content', 'contentFormat', 'learningObjectives', 'estimatedMinutes'];
  return validateKnownFields(request, response, next, allowed, {
    required: ['title', 'order', 'content']
  });
}

function validateLessonUpdate(request, response, next) {
  const allowed = ['title', 'order', 'content', 'contentFormat', 'learningObjectives', 'estimatedMinutes'];
  return validateKnownFields(request, response, next, allowed);
}

function validatePublication(request, response, next) {
  return validateKnownFields(request, response, next, ['publicationStatus'], {
    required: ['publicationStatus']
  });
}

function validateStoryUpdate(request, response, next) {
  return validateKnownFields(request, response, next, STORY_UPDATE_FIELDS);
}

module.exports = {
  validateChapter,
  validateChapterUpdate,
  validateCreateStory,
  validateAdminStoryQuery,
  validateIdentifier,
  validateLesson,
  validateLessonUpdate,
  validatePublication,
  validateStoryQuery,
  validateStoryUpdate,
  validateSubdocumentIds
};
