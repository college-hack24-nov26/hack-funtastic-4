const AUTH_COOKIE_NAME = 'mythoverse_token';
const AUTH_TOKEN_TTL_MS = 60 * 60 * 1000;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    const error = new Error('Authentication is not configured.');
    error.statusCode = 500;
    throw error;
  }

  return secret;
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  };
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_MS,
  getAuthCookieOptions,
  getJwtSecret
};
