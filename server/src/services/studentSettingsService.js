const bcrypt = require('bcryptjs');
const User = require('../models/user');

const NOTIFICATION_KEYS = [
  'learningReminders',
  'assessmentNotifications',
  'announcementNotifications',
  'achievementNotifications'
];
const BCRYPT_ROUNDS = 12;

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isTimeZone(value) {
  if (typeof value !== 'string' || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validateObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError('A valid settings object is required.');
  }
}

async function findStudent(studentId, { withPassword = false } = {}) {
  const query = User.findOne({ _id: studentId, role: 'student', isActive: true });
  if (withPassword) query.select('+passwordHash');
  const student = await query;
  if (!student) throw httpError('Student account not found.', 404);
  return student;
}

function serializeSettings(student) {
  const settings = student.dashboardSettings || {};
  const notifications = settings.notifications || {};
  const appearance = settings.appearance || {};
  return {
    timeZone: settings.timeZone || 'UTC',
    notifications: Object.fromEntries(NOTIFICATION_KEYS.map((key) => [key, notifications[key] !== false])),
    appearance: {
      theme: appearance.theme === 'light' ? 'light' : 'dark',
      fontSize: appearance.fontSize === 'large' ? 'large' : 'standard'
    }
  };
}

async function getSettings(studentId) {
  return { settings: serializeSettings(await findStudent(studentId)) };
}

async function updatePreferences(studentId, input) {
  validateObject(input);
  const allowed = new Set(['timeZone', 'theme', 'fontSize']);
  if (!Object.keys(input).length || Object.keys(input).some((key) => !allowed.has(key))) {
    throw httpError('Settings fields are invalid.');
  }
  if ('timeZone' in input && !isTimeZone(input.timeZone)) throw httpError('Choose a valid time zone.');
  if ('theme' in input && !['dark', 'light'].includes(input.theme)) throw httpError('Choose a supported appearance.');
  if ('fontSize' in input && !['standard', 'large'].includes(input.fontSize)) throw httpError('Choose a supported font size.');

  const student = await findStudent(studentId);
  if ('timeZone' in input) student.set('dashboardSettings.timeZone', input.timeZone);
  if ('theme' in input) student.set('dashboardSettings.appearance.theme', input.theme);
  if ('fontSize' in input) student.set('dashboardSettings.appearance.fontSize', input.fontSize);
  await student.save();
  return { settings: serializeSettings(student) };
}

async function updateNotifications(studentId, input) {
  validateObject(input);
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !NOTIFICATION_KEYS.includes(key))
    || keys.some((key) => typeof input[key] !== 'boolean')) {
    throw httpError('Notification preferences must contain supported true/false values.');
  }
  const student = await findStudent(studentId);
  for (const key of keys) student.set(`dashboardSettings.notifications.${key}`, input[key]);
  await student.save();
  return { settings: serializeSettings(student) };
}

async function changePassword(studentId, input) {
  validateObject(input);
  if (Object.keys(input).some((key) => !['currentPassword', 'newPassword'].includes(key))
    || typeof input.currentPassword !== 'string'
    || typeof input.newPassword !== 'string') {
    throw httpError('Current and new passwords are required.');
  }
  if (input.newPassword.length < 12 || Buffer.byteLength(input.newPassword, 'utf8') > 72) {
    throw httpError('New password must be at least 12 characters and no more than 72 bytes.');
  }
  const student = await findStudent(studentId, { withPassword: true });
  if (!await bcrypt.compare(input.currentPassword, student.passwordHash)) {
    throw httpError('Current password is incorrect.', 401);
  }
  if (input.currentPassword === input.newPassword) {
    throw httpError('Choose a new password different from the current password.');
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  const result = await User.updateOne(
    { _id: student._id, role: 'student', passwordHash: student.passwordHash },
    { $set: { passwordHash } },
    { runValidators: true, timestamps: false }
  );
  if (result.matchedCount !== 1) throw httpError('Student account changed during this operation. Sign in again and retry.', 409);
  return { message: 'Password changed. Sign in again with your new password.' };
}

module.exports = { changePassword, getSettings, updateNotifications, updatePreferences };
