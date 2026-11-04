const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const controller = require('../controllers/learningContentController');
const validation = require('../middleware/validateLearningContent');

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get('/stories', validation.validateAdminStoryQuery, controller.listAdminStories);
router.get('/stories/:identifier', validation.validateIdentifier, controller.getAdminStory);
router.post('/stories', requireSameOrigin, validation.validateCreateStory, controller.createStory);
router.patch('/stories/:identifier', requireSameOrigin, validation.validateIdentifier, validation.validateStoryUpdate, controller.updateStory);
router.patch('/stories/:identifier/publication', requireSameOrigin, validation.validateIdentifier, validation.validatePublication, controller.setStoryPublication);
router.post('/stories/:identifier/chapters', requireSameOrigin, validation.validateIdentifier, validation.validateChapter, controller.addChapter);
router.patch('/stories/:identifier/chapters/:chapterId', requireSameOrigin, validation.validateIdentifier, validation.validateSubdocumentIds, validation.validateChapterUpdate, controller.updateChapter);
router.post('/stories/:identifier/chapters/:chapterId/lessons', requireSameOrigin, validation.validateIdentifier, validation.validateSubdocumentIds, validation.validateLesson, controller.addLesson);
router.patch('/stories/:identifier/chapters/:chapterId/lessons/:lessonId', requireSameOrigin, validation.validateIdentifier, validation.validateSubdocumentIds, validation.validateLessonUpdate, controller.updateLesson);

module.exports = router;
