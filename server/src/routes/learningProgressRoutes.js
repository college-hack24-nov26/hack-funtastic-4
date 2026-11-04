const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const requireStudent = require('../middleware/requireStudent');
const validation = require('../middleware/validateLearningContent');
const controller = require('../controllers/learningProgressController');

const router = express.Router();

router.use(authenticate, requireStudent);
router.get('/summary', controller.getProgressSummary);
router.get('/last-accessed', controller.getLastAccessed);
router.get('/stories/:identifier', validation.validateIdentifier, controller.getStoryProgress);
router.post(
  '/stories/:identifier/chapters/:chapterId/lessons/:lessonId/access',
  requireSameOrigin,
  validation.validateIdentifier,
  validation.validateSubdocumentIds,
  controller.recordLessonAccess
);
router.post(
  '/stories/:identifier/chapters/:chapterId/lessons/:lessonId/complete',
  requireSameOrigin,
  validation.validateIdentifier,
  validation.validateSubdocumentIds,
  controller.completeLesson
);

module.exports = router;
