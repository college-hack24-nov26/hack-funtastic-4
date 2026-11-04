const learningProgressService = require('../services/learningProgressService');

function respondWith(action) {
  return async function progressController(request, response, next) {
    try {
      return response.status(200).json(await action(request));
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  completeLesson: respondWith((request) => learningProgressService.completeLesson(
    request.user.id,
    request.user.ageGroup,
    request.params.identifier,
    request.params.chapterId,
    request.params.lessonId
  )),
  getLastAccessed: respondWith((request) => learningProgressService.getLastAccessed(
    request.user.id,
    request.user.ageGroup
  )),
  getProgressSummary: respondWith((request) => learningProgressService.getProgressSummary(
    request.user.id,
    request.user.ageGroup
  )),
  getStoryProgress: respondWith((request) => learningProgressService.getStoryProgress(
    request.user.id,
    request.user.ageGroup,
    request.params.identifier
  )),
  recordLessonAccess: respondWith((request) => learningProgressService.recordLessonAccess(
    request.user.id,
    request.user.ageGroup,
    request.params.identifier,
    request.params.chapterId,
    request.params.lessonId
  ))
};
