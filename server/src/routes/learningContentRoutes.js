const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireStudent = require('../middleware/requireStudent');
const controller = require('../controllers/learningContentController');
const validation = require('../middleware/validateLearningContent');

const router = express.Router();

router.use(authenticate, requireStudent);
router.get('/stories', validation.validateStoryQuery, controller.listPublishedStories);
router.get('/stories/:identifier/chapters/:chapterId/lessons', validation.validateIdentifier, validation.validateSubdocumentIds, controller.getPublishedLessons);
router.get('/stories/:identifier/chapters', validation.validateIdentifier, controller.getPublishedChapters);
router.get('/stories/:identifier', validation.validateIdentifier, controller.getPublishedStory);

module.exports = router;
