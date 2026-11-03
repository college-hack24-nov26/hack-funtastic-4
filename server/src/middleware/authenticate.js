const User = require('../models/user');
const { AUTH_COOKIE_NAME } = require('../config/auth');
const { verifyToken, toSafeUser } = require('../services/authService');

async function authenticate(request, response, next) {
  const token = request.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return response.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = verifyToken(token);

    if (!payload || typeof payload.sub !== 'string') {
      return response.status(401).json({ error: 'Authentication required.' });
    }

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return response.status(401).json({ error: 'Authentication required.' });
    }

    request.user = toSafeUser(user);
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(401).json({ error: 'Authentication required.' });
    }

    return next(error);
  }
}

module.exports = authenticate;
