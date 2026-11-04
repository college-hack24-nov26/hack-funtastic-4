const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireStudent = require('../middleware/requireStudent');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const validation = require('../middleware/validateTeacherContent');
const controller = require('../controllers/teacherLearningController');
const Teacher = require('../models/teacher');

const router = express.Router();
router.use(authenticate, requireStudent);

router.get('/progress', controller.progress);
router.get('/results/:attemptId', validation.validateObjectId('attemptId'), controller.result);
router.get('/', (request, response, next) => {
  if (request.query.ageGroup && !Teacher.AGE_GROUPS.includes(request.query.ageGroup)) {
    const error = new Error('Choose a supported age group.'); error.statusCode = 400; return next(error);
  }
  return controller.list(request, response, next);
});
router.get('/:slug', validation.validateSlug, controller.get);
router.get('/:slug/age-groups/:ageGroup/syllabus', validation.validateSlug, validation.validateAgeGroup, controller.syllabus);
router.get('/:slug/age-groups/:ageGroup/lessons/:lessonId', validation.validateSlug, validation.validateAgeGroup, validation.validateObjectId('lessonId'), controller.lesson);
router.post('/:slug/age-groups/:ageGroup/lessons/:lessonId/access', requireSameOrigin, validation.validateSlug, validation.validateAgeGroup, validation.validateObjectId('lessonId'), controller.accessLesson);
router.post('/:slug/age-groups/:ageGroup/lessons/:lessonId/complete', requireSameOrigin, validation.validateSlug, validation.validateAgeGroup, validation.validateObjectId('lessonId'), controller.completeLesson);
router.post('/:slug/age-groups/:ageGroup/assessments/:assessmentId/submit', requireSameOrigin, validation.validateSlug, validation.validateAgeGroup, validation.validateObjectId('assessmentId'), controller.submitAssessment);

module.exports = router;
