const learningContentService = require('../services/learningContentService');

function respondWith(action, statusCode = 200) {
  return async function controller(request, response, next) {
    try {
      const result = await action(request);
      return response.status(statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  addChapter: respondWith((request) => learningContentService.addChapter(request.params.identifier, request.body)),
  addLesson: respondWith((request) => learningContentService.addLesson(request.params.identifier, request.params.chapterId, request.body)),
  createStory: respondWith((request) => learningContentService.createStory(request.body), 201),
  getAdminStory: respondWith((request) => learningContentService.getAdminStory(request.params.identifier)),
  listAdminStories: respondWith((request) => learningContentService.listAdminStories(request.query)),
  getPublishedChapters: respondWith((request) => learningContentService.getPublishedChapters(request.params.identifier)),
  getPublishedLessons: respondWith((request) => learningContentService.getPublishedLessons(request.params.identifier, request.params.chapterId)),
  getPublishedStory: respondWith((request) => learningContentService.getPublishedStory(request.params.identifier)),
  listPublishedStories: respondWith((request) => learningContentService.listPublishedStories(request.query)),
  setStoryPublication: respondWith((request) => learningContentService.setStoryPublication(request.params.identifier, request.body.publicationStatus)),
  updateLesson: respondWith((request) => learningContentService.updateLesson(request.params.identifier, request.params.chapterId, request.params.lessonId, request.body)),
  updateChapter: respondWith((request) => learningContentService.updateChapter(request.params.identifier, request.params.chapterId, request.body)),
  updateStory: respondWith((request) => learningContentService.updateStory(request.params.identifier, request.body))
};
