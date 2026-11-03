const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const requireStudent = require('../middleware/requireStudent');
const studentProfileController = require('../controllers/studentProfileController');

const router = express.Router();

router.use(authenticate, requireStudent);

router.get('/profile', studentProfileController.getProfile);
router.put('/profile', requireSameOrigin, studentProfileController.updateProfile);
router.get('/onboarding/status', studentProfileController.getOnboardingStatus);
router.post('/onboarding/complete', requireSameOrigin, studentProfileController.completeOnboarding);

module.exports = router;
