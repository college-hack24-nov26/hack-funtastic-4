const { createHash, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/user');
const GuardianInvite = require('../models/guardianInvite');
const GuardianRelationship = require('../models/guardianRelationship');
const authService = require('./authService');
const emailService = require('./emailService');
const studentDashboardService = require('./studentDashboardService');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeInviteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('A guardian email and relationship are required.');
  if (typeof input.email !== 'string' || !EMAIL_PATTERN.test(input.email.trim())) throw fail('Enter a valid guardian email address.');
  if (!['parent', 'guardian', 'other'].includes(input.relationship)) throw fail('Choose a supported relationship.');
  return { email: input.email.trim().toLowerCase(), relationship: input.relationship };
}

async function createInvite(studentId, input) {
  const { email, relationship } = normalizeInviteInput(input);
  const student = await User.findOne({ _id: studentId, role: 'student', isActive: true }).select('email displayName');
  if (!student) throw fail('Student account is unavailable.', 404);
  if (student.email === email) throw fail('Use a different email address for the guardian.', 400);
  const existingUser = await User.findOne({ email }).select('role');
  if (existingUser && existingUser.role !== 'guardian') throw fail('This email belongs to an account that cannot be linked as a guardian.', 409);
  const relationshipRecord = await GuardianRelationship.findOne({ student: studentId, email, status: { $in: ['pending', 'approved'] } });
  if (relationshipRecord) throw fail('A pending or approved guardian connection already exists for this email.', 409);

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await GuardianInvite.findOneAndUpdate(
    { student: studentId, email },
    { $set: { relationship, tokenHash, expiresAt, status: 'pending', acceptedBy: null, acceptedAt: null } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  let baseUrl;
  try {
    baseUrl = new URL(process.env.APP_BASE_URL || 'http://localhost:3000');
    if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('invalid protocol');
    if (baseUrl.username || baseUrl.password || (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:')) throw new Error('invalid base URL');
    const inviteUrl = new URL('/guardian-invite.html', baseUrl);
    inviteUrl.searchParams.set('token', token);
    await emailService.sendGuardianInvite({ email, studentName: student.displayName, inviteUrl: inviteUrl.toString() });
  } catch (error) {
    await GuardianInvite.deleteOne({ _id: invite._id, tokenHash }).catch(() => {});
    if (error.statusCode) throw error;
    throw fail('The guardian invitation could not be sent. Check the mail configuration and try again.', 503);
  }
  return { message: 'A verification invitation was sent to the guardian email address.', expiresAt };
}

async function completeVerifiedInvite(invite, guardian) {
  if (guardian.email !== invite.email || guardian.role !== 'guardian' || !guardian.isActive) {
    throw fail('The signed-in guardian account does not match this invitation.', 403);
  }
  const now = new Date();
  const claim = await GuardianInvite.findOneAndUpdate(
    { _id: invite._id, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'accepted', acceptedBy: guardian._id, acceptedAt: now } },
    { new: true }
  );
  if (!claim) throw fail('This invitation has already been used or has expired.', 410);
  try {
    const relationship = await GuardianRelationship.findOneAndUpdate(
      { student: invite.student, email: invite.email },
      { $set: {
        guardian: guardian._id, relationship: invite.relationship, status: 'pending',
        invitedAt: invite.createdAt, verifiedAt: now, approvedAt: null, revokedAt: null
      } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return { message: 'Email verified. The student must approve this guardian request before access is granted.', relationshipId: relationship._id.toString() };
  } catch (error) {
    await GuardianInvite.updateOne({ _id: invite._id, acceptedBy: guardian._id }, { $set: { status: 'pending', acceptedBy: null, acceptedAt: null } }).catch(() => {});
    throw error;
  }
}

async function acceptInviteForNewGuardian(input) {
  if (!input || typeof input !== 'object' || typeof input.token !== 'string' || input.token.length !== 43) throw fail('A valid guardian invitation token is required.');
  const invite = await GuardianInvite.findOne({ tokenHash: hashToken(input.token), status: 'pending', expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!invite) throw fail('This invitation is invalid or has expired.', 410);
  if (await User.exists({ email: invite.email })) throw fail('A guardian account already uses this email. Sign in to accept the invitation.', 409);
  const user = await authService.createGuardianAccount({ displayName: input.displayName, email: invite.email, password: input.password });
  const guardian = await User.findById(user.id);
  const result = await completeVerifiedInvite(invite, guardian);
  return { ...result, guardian: { displayName: guardian.displayName } };
}

async function acceptInviteForExistingGuardian(guardianId, input) {
  if (!input || typeof input.token !== 'string' || input.token.length !== 43) throw fail('A valid guardian invitation token is required.');
  const guardian = await User.findOne({ _id: guardianId, role: 'guardian', isActive: true });
  if (!guardian) throw fail('Guardian account is unavailable.', 404);
  const invite = await GuardianInvite.findOne({ tokenHash: hashToken(input.token), status: 'pending', expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!invite) throw fail('This invitation is invalid or has expired.', 410);
  return completeVerifiedInvite(invite, guardian);
}

async function listStudentRelationships(studentId) {
  const [relationships, invites] = await Promise.all([
    GuardianRelationship.find({ student: studentId }).populate({ path: 'guardian', select: 'displayName email role isActive' }).sort({ updatedAt: -1 }).lean(),
    GuardianInvite.find({ student: studentId, status: 'pending', expiresAt: { $gt: new Date() } }).select('email relationship createdAt expiresAt').lean()
  ]);
  return {
    relationships: relationships.map((item) => ({
      id: item._id.toString(), email: item.email,
      guardianName: item.guardian?.displayName || item.email,
      relationship: item.relationship,
      status: item.status,
      invitedAt: item.invitedAt,
      verifiedAt: item.verifiedAt,
      approvedAt: item.approvedAt,
      revokedAt: item.revokedAt
    })),
    invitations: invites.map((item) => ({ email: item.email, relationship: item.relationship, status: 'awaitingVerification', invitedAt: item.createdAt, expiresAt: item.expiresAt }))
  };
}

async function setStudentApproval(studentId, relationshipId, decision) {
  if (!mongoose.isObjectIdOrHexString(relationshipId)) throw fail('Guardian relationship identifier is invalid.');
  if (!['approved', 'rejected'].includes(decision)) throw fail('Choose approve or reject.');
  const relationship = await GuardianRelationship.findOneAndUpdate(
    { _id: relationshipId, student: studentId, status: 'pending' },
    { $set: { status: decision, approvedAt: decision === 'approved' ? new Date() : null, revokedAt: null } },
    { new: true }
  );
  if (!relationship) throw fail('Pending guardian request not found.', 404);
  return { relationship: { id: relationship._id.toString(), status: relationship.status, approvedAt: relationship.approvedAt } };
}

async function revokeStudentApproval(studentId, relationshipId) {
  if (!mongoose.isObjectIdOrHexString(relationshipId)) throw fail('Guardian relationship identifier is invalid.');
  const relationship = await GuardianRelationship.findOneAndUpdate(
    { _id: relationshipId, student: studentId, status: 'approved' },
    { $set: { status: 'revoked', revokedAt: new Date() } }, { new: true }
  );
  if (!relationship) throw fail('Approved guardian connection not found.', 404);
  return { relationship: { id: relationship._id.toString(), status: relationship.status, revokedAt: relationship.revokedAt } };
}

async function listGuardianRelationships(guardianId) {
  const relationships = await GuardianRelationship.find({ guardian: guardianId }).populate({ path: 'student', select: 'displayName ageGroup role isActive' }).sort({ updatedAt: -1 }).lean();
  return { relationships: relationships.filter((item) => item.student?.isActive && item.student.role === 'student').map((item) => ({
    id: item._id.toString(), studentId: item.student._id.toString(), studentName: item.student.displayName,
    relationship: item.relationship, status: item.status, approvedAt: item.approvedAt
  })) };
}

async function getApprovedStudentDashboard(guardianId, studentId, timeZone) {
  if (!mongoose.isObjectIdOrHexString(studentId)) throw fail('Student identifier is invalid.');
  const [relationship, studentAccount] = await Promise.all([
    GuardianRelationship.findOne({ guardian: guardianId, student: studentId, status: 'approved' }),
    User.findOne({ _id: studentId, role: 'student', isActive: true }).select('_id')
  ]);
  if (!relationship || !studentAccount) throw fail('Approved student access was not found.', 404);
  const snapshot = await studentDashboardService.getDashboard(studentId, timeZone);
  return {
    student: { displayName: snapshot.student.displayName, ageGroup: snapshot.student.ageGroup },
    learning: snapshot.learning,
    teacherProgress: snapshot.teachers.map((teacher) => ({ name: teacher.name, progress: teacher.progress })),
    weeklyActivity: snapshot.weeklyActivity,
    dharma: snapshot.dharma,
    ashram: snapshot.ashram,
    announcements: snapshot.announcements
  };
}

module.exports = {
  acceptInviteForExistingGuardian,
  acceptInviteForNewGuardian,
  createInvite,
  getApprovedStudentDashboard,
  listGuardianRelationships,
  listStudentRelationships,
  revokeStudentApproval,
  setStudentApproval
};
