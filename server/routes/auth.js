const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/user");
const { validate } = require("../middleware/validate");
const HttpError = require("../utils/httpError");
const auth = require("../middleware/authenticate");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait and try again." } },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authLimiter, (req, res, next) => {
  try {
    const clean = validate(req.body, {
      email: { type: "string", required: true, min: 5, max: 120, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternMessage: "Enter a valid email." },
      password: { type: "string", required: true, min: 8, max: 128 },
      displayName: { type: "string", required: true, min: 2, max: 60 },
      ageGroup: { type: "string", enum: User.AGE_GROUPS, default: "9-12" },
      role: { type: "string", enum: ["student", "admin", "teacher", "guardian"], default: "student" },
    });
    req.cleanBody = clean;
    next();
  } catch (err) { next(err); }
}, async (req, res, next) => {
  try {
    const { email, password, displayName, ageGroup, role } = req.cleanBody;
    const existing = await User.findOne({ email }).lean();
    if (existing) throw new HttpError(409, "DUPLICATE", "That email is already registered.");
    const passwordHash = await auth.hashPassword(password);
    const user = await User.create({ email, passwordHash, displayName, ageGroup, role });
    const token = auth.signSession(user);
    auth.setSessionCookie(res, token);
    res.status(201).json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, role: user.role, ageGroup: user.ageGroup } });
  } catch (err) { next(err); }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = validate(req.body, {
      email: { type: "string", required: true, max: 120 },
      password: { type: "string", required: true, max: 128 },
    });
    const user = await User.findOne({ email: email.toLowerCase() });
    const ok = user ? await auth.verifyPassword(password, user.passwordHash) : false;
    // Generic error: do not reveal whether the account exists.
    if (!ok) throw new HttpError(401, "BAD_CREDENTIALS", "Email or password is incorrect.");
    const token = auth.signSession(user);
    auth.setSessionCookie(res, token);
    res.json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, role: user.role, ageGroup: user.ageGroup } });
  } catch (err) { next(err); }
});

router.post("/logout", (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", auth.attachUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
  res.json({ user: req.user });
});

module.exports = router;
