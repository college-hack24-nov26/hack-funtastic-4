const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response, next) => {
      const error = new Error('Too many authentication attempts. Please try again later.');
      error.statusCode = 429;
      next(error);
    }
  });
}

router.post('/register', createAuthRateLimiter(), (request, response, next) => {
  authController.register(request, response).catch(next);
});

router.post('/login', createAuthRateLimiter(), (request, response, next) => {
  authController.login(request, response).catch(next);
});

router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
