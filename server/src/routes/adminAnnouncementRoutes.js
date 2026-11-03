const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const controller = require('../controllers/adminAnnouncementController');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/', controller.list);
router.post('/', requireSameOrigin, controller.create);
router.patch('/:id', requireSameOrigin, controller.update);
router.patch('/:id/publication', requireSameOrigin, controller.publication);

module.exports = router;
