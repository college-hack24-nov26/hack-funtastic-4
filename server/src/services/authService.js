const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { AUTH_TOKEN_TTL_MS, getJwtSecret } = require('../config/auth');

const AGE_GROUPS = new Set(['6-8', '9-12', '13-15', '16-18', '18+']);
const BCRYPT_ROUNDS = 12;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validateEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateStrongPassword(password, accountType = 'Administrator') {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw createError(`${accountType} password must be at least 12 characters and no more than 72 bytes.`, 400);
  }
}

function validateRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('A valid request body is required.', 400);
  }

  const { displayName, email, password, ageGroup } = input;

  if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 80) {
    throw createError('Display name must be between 2 and 80 characters.', 400);
  }

  if (!validateEmail(email)) {
    throw createError('Enter a valid email address.', 400);
  }

  if (
    typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw createError('Password must be at least 8 characters and no more than 72 bytes.', 400);
  }

  if (typeof ageGroup !== 'string' || !AGE_GROUPS.has(ageGroup)) {
    throw createError('Select a supported age group.', 400);
  }
}

function validateLogin(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('A valid request body is required.', 400);
  }

  const { email, password } = input;

  if (!validateEmail(email)) {
    throw createError('Enter a valid email address and password.', 400);
  }

  if (
    typeof password !== 'string'
    || password.length === 0
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw createError('Enter a valid email address and password.', 400);
  }
}

function toSafeUser(user) {
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    ageGroup: user.ageGroup,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function register(input) {
  validateRegistration(input);

  const email = normalizeEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const user = await User.create({
      displayName: input.displayName.trim(),
      email,
      passwordHash,
      ageGroup: input.ageGroup,
      role: 'student'
    });

    return toSafeUser(user);
  } catch (error) {
    if (error.code === 11000) {
      throw createError('An account with this email already exists.', 409);
    }

    if (error.name === 'ValidationError') {
      throw createError('The account details are invalid.', 400);
    }

    throw error;
  }
}

async function provisionFirstAdmin(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('A valid administrator configuration is required.', 400);
  }

  const { displayName, email, password } = input;
  if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 80) {
    throw createError('Administrator display name must be between 2 and 80 characters.', 400);
  }
  if (!validateEmail(email)) {
    throw createError('Enter a valid administrator email address.', 400);
  }
  validateStrongPassword(password);

  if (await User.exists({ role: 'admin' })) {
    throw createError('An administrator account already exists. No account was changed.', 409);
  }

  const normalizedEmail = normalizeEmail(email);
  if (await User.exists({ email: normalizedEmail })) {
    throw createError('An account already uses this email. No account was changed.', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const user = await User.create({
      displayName: displayName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'admin'
    });
    return toSafeUser(user);
  } catch (error) {
    if (error.code === 11000) {
      throw createError('An account already uses this email. No account was changed.', 409);
    }
    if (error.name === 'ValidationError') {
      throw createError('The administrator details are invalid.', 400);
    }
    throw error;
  }
}

async function changePasswordForRole(input, role) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError(`A valid ${role} account and password are required.`, 400);
  }

  const { email, password } = input;
  const roleLabel = role === 'admin' ? 'Administrator' : 'Student';
  if (!validateEmail(email)) {
    throw createError(`Enter a valid ${roleLabel.toLowerCase()} email address.`, 400);
  }
  validateStrongPassword(password, roleLabel);

  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw createError('No account exists with that email address.', 404);
  }
  if (user.role !== role) {
    throw createError(`The account for that email is not a ${roleLabel.toLowerCase()}. No account was changed.`, 403);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await User.updateOne(
    { _id: user._id, role },
    { $set: { passwordHash } },
    { runValidators: true, timestamps: false }
  );
  if (result.matchedCount !== 1) {
    throw createError(`The ${roleLabel.toLowerCase()} account changed during this operation. No password was changed.`, 409);
  }

  return { email: normalizedEmail, role };
}

async function changeAdminPassword(input) {
  return changePasswordForRole(input, 'admin');
}

async function changeStudentPassword(input) {
  return changePasswordForRole(input, 'student');
}

async function createGuardianAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('A valid guardian account is required.', 400);
  }
  const { displayName, email, password } = input;
  if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 80) {
    throw createError('Guardian name must be between 2 and 80 characters.', 400);
  }
  if (!validateEmail(email)) throw createError('Enter a valid guardian email address.', 400);
  validateStrongPassword(password, 'Guardian');
  const normalizedEmail = normalizeEmail(email);
  if (await User.exists({ email: normalizedEmail })) {
    throw createError('An account already uses this email. Sign in to the existing guardian account to accept the invitation.', 409);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const user = await User.create({
      displayName: displayName.trim(), email: normalizedEmail, passwordHash, role: 'guardian'
    });
    return toSafeUser(user);
  } catch (error) {
    if (error.code === 11000) throw createError('An account already uses this email.', 409);
    if (error.name === 'ValidationError') throw createError('Guardian account details are invalid.', 400);
    throw error;
  }
}

async function login(input) {
  validateLogin(input);

  const user = await User.findOne({ email: normalizeEmail(input.email) })
    .select('+passwordHash');

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash)) || !user.isActive) {
    throw createError('Invalid email or password.', 401);
  }

  const token = jwt.sign(
    { sub: user._id.toString() },
    getJwtSecret(),
    { expiresIn: Math.floor(AUTH_TOKEN_TTL_MS / 1000), algorithm: 'HS256' }
  );

  return {
    token,
    user: toSafeUser(user)
  };
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256']
  });
}

module.exports = {
  changeAdminPassword,
  changeStudentPassword,
  createGuardianAccount,
  login,
  provisionFirstAdmin,
  register,
  toSafeUser,
  verifyToken
};
