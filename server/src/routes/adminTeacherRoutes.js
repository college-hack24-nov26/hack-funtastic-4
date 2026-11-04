const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const validation = require('../middleware/validateTeacherContent');
const controller = require('../controllers/teacherAdminController');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/', controller.list);
router.get('/:slug', validation.validateSlug, controller.get);
router.post('/', requireSameOrigin, validation.validateAdminPayload(), controller.create);
router.patch('/:slug', requireSameOrigin, validation.validateSlug, validation.validateAdminPayload({ partial: true }), controller.update);
router.patch('/:slug/publication', requireSameOrigin, validation.validateSlug, validation.validatePublication, controller.publication);

module.exports = router;
