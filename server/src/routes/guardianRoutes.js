const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const requireGuardian = require('../middleware/requireGuardian');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const controller = require('../controllers/guardianController');

const router = express.Router();
const acceptInviteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post('/invites/accept', acceptInviteLimiter, requireSameOrigin, controller.acceptNew);
router.use(authenticate, requireGuardian);
router.post('/invites/accept-existing', requireSameOrigin, controller.acceptExisting);
router.get('/relationships', controller.guardianRelationships);
router.get('/students/:studentId/dashboard', controller.studentDashboard);

module.exports = router;
