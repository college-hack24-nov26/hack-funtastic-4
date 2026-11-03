const authService = require('../services/authService');
const {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_MS,
  getAuthCookieOptions
} = require('../config/auth');

async function register(request, response) {
  const user = await authService.register(request.body);
  return response.status(201).json({ user });
}

async function login(request, response) {
  const { token, user } = await authService.login(request.body);

  response.cookie(AUTH_COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    maxAge: AUTH_TOKEN_TTL_MS
  });

  return response.status(200).json({ user });
}

function logout(request, response) {
  response.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
  return response.status(200).json({ message: 'Logged out successfully.' });
}

function me(request, response) {
  return response.status(200).json({ user: request.user });
}

module.exports = {
  login,
  logout,
  me,
  register
};
