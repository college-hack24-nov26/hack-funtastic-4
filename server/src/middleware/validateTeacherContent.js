const mongoose = require('mongoose');
const Teacher = require('../models/teacher');

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateAgeGroup(request, response, next) {
  if (!Teacher.AGE_GROUPS.includes(request.params.ageGroup)) return next(badRequest('Choose a supported age group.'));
  return next();
}

function validateSlug(request, response, next) {
  if (typeof request.params.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(request.params.slug)) {
    return next(badRequest('Teacher identifier must be a valid slug.'));
  }
  return next();
}

function validateObjectId(parameter) {
  return (request, response, next) => {
    if (!mongoose.isObjectIdOrHexString(request.params[parameter])) return next(badRequest(`${parameter} must be a valid ID.`));
    return next();
  };
}

function validateAdminPayload({ partial = false } = {}) {
  const fields = new Set([
    'name', 'slug', 'identityType', 'title', 'shortIntroduction', 'mythologicalBackground',
    'personality', 'teachingPhilosophy', 'teachingDomain', 'knowledgeAndSkills', 'biography',
    'teachingStyle', 'portrait', 'sources', 'contentReviewStatus', 'ageGroups'
  ]);
  return (request, response, next) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return next(badRequest('A valid teacher content object is required.'));
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !fields.has(key))) return next(badRequest('Teacher content contains unsupported or missing fields.'));
    if (!partial && ['name', 'slug', 'identityType', 'title', 'shortIntroduction', 'mythologicalBackground', 'personality', 'teachingPhilosophy', 'teachingDomain', 'knowledgeAndSkills', 'biography', 'teachingStyle'].some((field) => !(field in body))) {
      return next(badRequest('Complete all required teacher profile fields.'));
    }
    return next();
  };
}

function validatePublication(request, response, next) {
  if (!['draft', 'published', 'archived'].includes(request.body?.publicationStatus)) return next(badRequest('Choose draft, published, or archived status.'));
  return next();
}

module.exports = { validateAgeGroup, validateAdminPayload, validateObjectId, validatePublication, validateSlug };
