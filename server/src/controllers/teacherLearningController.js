const service = require('../services/teacherLearningService');

function respond(action, status = 200) {
  return async (request, response, next) => {
    try { return response.status(status).json(await action(request)); } catch (error) { return next(error); }
  };
}

module.exports = {
  list: respond((request) => service.listTeachers(request.user.id, request.query.ageGroup)),
  get: respond((request) => service.getTeacher(request.params.slug, request.user.id, request.query.ageGroup)),
  syllabus: respond((request) => service.getSyllabus(request.params.slug, request.params.ageGroup, request.user.id)),
  lesson: respond((request) => service.getLesson(request.params.slug, request.params.ageGroup, request.params.lessonId, request.user.id)),
  accessLesson: respond((request) => service.recordLessonAccess(request.params.slug, request.params.ageGroup, request.params.lessonId, request.user.id)),
  completeLesson: respond((request) => service.completeLesson(request.params.slug, request.params.ageGroup, request.params.lessonId, request.user.id)),
  submitAssessment: respond((request) => service.submitAssessment(request.params.slug, request.params.ageGroup, request.params.assessmentId, request.body, request.user.id), 201),
  result: respond((request) => service.getAssessmentResult(request.params.attemptId, request.user.id)),
  progress: respond((request) => service.getStudentProgress(request.user.id))
};
