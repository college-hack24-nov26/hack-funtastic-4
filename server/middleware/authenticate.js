const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user");

/*
 * AUTHENTICATION ADAPTER
 * ----------------------
 * Authentication is owned by Kshitij's shared module. This is a minimal,
 * clearly-isolated adapter so Prathmesh's student/admin modules run end to
 * end today. It stores the SAME fields the shared contract needs
 * (email, passwordHash, role, ageGroup, displayName) in the `users`
 * collection, issues HTTP-only cookie JWTs, and exposes the middleware
 * contract the shared implementation must honour:
 *   - attachUser  : resolves req.user from the session cookie
 *   - requireAuth : 401 when unauthenticated
 *   - requireRole(role) : 403 when role mismatch
 * Replace src of truth later by swapping this adapter only.
 */

const COOKIE_NAME = "mv_session";

function signSession(user) {
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 24);
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.displayName },
    process.env.JWT_SECRET,
    { expiresIn: `${ttlHours}h` }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Number(process.env.SESSION_TTL_HOURS || 24) * 3600 * 1000,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

async function attachUser(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).lean();
    if (user) {
      req.user = {
        id: String(user._id),
        role: user.role,
        displayName: user.displayName,
        ageGroup: user.ageGroup,
        email: user.email,
      };
    }
  } catch (err) {
    // expired or tampered token -> treat as anonymous
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission for this action." } });
    }
    next();
  };
}

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  COOKIE_NAME,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
  requireRole,
  hashPassword,
  verifyPassword,
};
