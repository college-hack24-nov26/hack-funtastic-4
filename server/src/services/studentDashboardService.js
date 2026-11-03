const LearningContent = require('../models/learningContent');
const LearningProgress = require('../models/learningProgress');
const Teacher = require('../models/teacher');
const TeacherProgress = require('../models/teacherProgress');
const TeacherAssessmentAttempt = require('../models/teacherAssessmentAttempt');
const User = require('../models/user');
const progressionService = require('./progressionService');
const GuardianInvite = require('../models/guardianInvite');
const GuardianRelationship = require('../models/guardianRelationship');
const studentProfileService = require('./studentProfileService');
const learningProgressService = require('./learningProgressService');

const DAY_MS = 24 * 60 * 60 * 1000;

function validTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length > 100) return null;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date()); return timeZone; }
  catch { return null; }
}

function dayKey(value, timeZone) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function localDaySequence(timeZone, now = new Date()) {
  const today = dayKey(now, timeZone);
  const [year, month, day] = today.split('-').map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor - DAY_MS * (6 - index));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  });
}

function findRecommendedAssessment(teacher, ageGroup, attempted) {
  for (const module of teacher.ageGroups.find((path) => path.ageGroup === ageGroup)?.modules || []) {
    const candidates = [module.assessment, ...module.chapters.map((chapter) => chapter.assessment)].filter(Boolean);
    for (const assessment of candidates) {
      if (!assessment.questions.length || attempted.has(assessment._id.toString())) continue;
      return {
        teacher: { name: teacher.name, slug: teacher.slug },
        assessmentId: assessment._id.toString(),
        title: assessment.title,
        questionCount: assessment.questions.length,
        difficulty: teacher.ageGroups.find((path) => path.ageGroup === ageGroup).difficulty,
        estimatedMinutes: assessment.timeLimitMinutes || 10,
        href: `/teacher-assessment.html?${new URLSearchParams({ teacher: teacher.slug, ageGroup, assessment: assessment._id.toString() })}`
      };
    }
  }
  return null;
}

async function getWeeklyActivity(studentId, timeZone, now = new Date()) {
  const dayKeys = localDaySequence(timeZone, now);
  const windowStart = new Date(now.getTime() - DAY_MS * 8);
  const windowEnd = now;
  const [storyProgress, teacherProgress, attempts, student] = await Promise.all([
    LearningProgress.find({ student: studentId }).select('completedLessons lastAccessedAt').lean(),
    TeacherProgress.find({ student: studentId }).select('lastAccessedAt').lean(),
    TeacherAssessmentAttempt.find({ student: studentId, submittedAt: { $gte: windowStart, $lte: windowEnd } }).select('submittedAt').lean(),
    User.findById(studentId).select('dharmaEarnedEvents').lean()
  ]);
  const counts = new Map(dayKeys.map((key) => [key, { date: key, lessonsCompleted: 0, testsAttempted: 0, studySessions: 0, dharmaEarned: 0, active: false }]));
  const add = (dateValue, type) => {
    const key = dayKey(dateValue, timeZone);
    const bucket = counts.get(key);
    if (!bucket) return;
    bucket[type] += 1;
    bucket.active = true;
  };
  for (const record of storyProgress) {
    for (const lesson of record.completedLessons || []) add(lesson.completedAt, 'lessonsCompleted');
    add(record.lastAccessedAt, 'studySessions');
  }
  for (const record of teacherProgress) add(record.lastAccessedAt, 'studySessions');
  for (const attempt of attempts) add(attempt.submittedAt, 'testsAttempted');
  for (const event of student?.dharmaEarnedEvents || []) {
    const key = dayKey(event.earnedAt, timeZone);
    const bucket = counts.get(key);
    if (bucket) { bucket.dharmaEarned += event.points; bucket.active = true; }
  }
  return [...counts.values()];
}

async function getDashboard(studentId, requestedTimeZone) {
  const [profile, accountPreferences] = await Promise.all([
    studentProfileService.getProfile(studentId),
    User.findById(studentId).select('dashboardSettings.timeZone').lean()
  ]);
  const ageGroup = profile.user.ageGroup;
  const timeZone = validTimeZone(requestedTimeZone)
    || validTimeZone(accountPreferences?.dashboardSettings?.timeZone)
    || 'UTC';
  const [learningResult, storiesResult, teachersResult, weeklyResult, announcementsResult, assessmentResult, relationshipsResult, progressionResult] = await Promise.allSettled([
    learningProgressService.getProgressSummary(studentId, ageGroup || undefined),
    require('./learningContentService').listPublishedStories({ ageGroup: ageGroup || '', page: '1', limit: '3' }),
    require('./teacherLearningService').listTeachers(studentId, ageGroup || undefined),
    getWeeklyActivity(studentId, timeZone),
    require('../models/announcement').find({ publicationStatus: 'published' })
      .select('title description category important publishedAt').sort({ publishedAt: -1 }).limit(5).lean(),
    (async () => {
      if (!ageGroup) return { teachers: [], attempts: [] };
      const [teachers, attempts] = await Promise.all([
        Teacher.find({ publicationStatus: 'published', 'ageGroups.ageGroup': ageGroup }).sort({ name: 1 }).lean(),
        TeacherAssessmentAttempt.find({ student: studentId, ageGroup }).select('assessmentId').lean()
      ]);
      return { teachers, attempts };
    })(),
    (async () => {
      const [relationships, invites] = await Promise.all([
        GuardianRelationship.find({ student: studentId }).populate({ path: 'guardian', select: 'displayName role isActive' }).sort({ updatedAt: -1 }).lean(),
        GuardianInvite.find({ student: studentId, status: 'pending', expiresAt: { $gt: new Date() } }).select('email relationship createdAt expiresAt').lean()
      ]);
      return {
        relationships: relationships.map((item) => ({
          id: item._id.toString(), email: item.email,
          guardianName: item.guardian?.displayName || item.email,
          relationship: item.relationship, status: item.status,
          invitedAt: item.invitedAt, verifiedAt: item.verifiedAt,
          approvedAt: item.approvedAt, revokedAt: item.revokedAt,
          guardianActive: Boolean(item.guardian?.isActive && item.guardian.role === 'guardian')
        })),
        invitations: invites.map((item) => ({ email: item.email, relationship: item.relationship, status: 'awaitingVerification', invitedAt: item.createdAt, expiresAt: item.expiresAt }))
      };
    })(),
    progressionService.recalculate(studentId)
  ]);
  const progression = progressionResult.status === 'fulfilled' ? progressionResult.value : null;
  const teachers = assessmentResult.status === 'fulfilled' ? assessmentResult.value.teachers : [];
  const attempts = assessmentResult.status === 'fulfilled' ? assessmentResult.value.attempts : [];
  const attemptedIds = new Set(attempts.map((attempt) => attempt.assessmentId.toString()));
  let recommendedAssessment = null;
  for (const teacher of teachers) {
    recommendedAssessment = findRecommendedAssessment(teacher, ageGroup, attemptedIds);
    if (recommendedAssessment) break;
  }
  return {
    student: { displayName: profile.user.displayName, ageGroup, onboardingCompleted: profile.user.onboardingCompleted, profileCompletion: profile.profileCompletion },
    learning: learningResult.status === 'fulfilled' ? learningResult.value.summary : null,
    continueLearning: learningResult.status === 'fulfilled' ? learningResult.value.continueLearning : null,
    stories: storiesResult.status === 'fulfilled' ? storiesResult.value.stories : [],
    teachers: teachersResult.status === 'fulfilled' ? teachersResult.value.teachers : [],
    weeklyActivity: weeklyResult.status === 'fulfilled' ? weeklyResult.value : [],
    announcements: announcementsResult.status === 'fulfilled' ? announcementsResult.value : [],
    recommendedAssessment,
    sectionStatus: {
      learning: learningResult.status === 'fulfilled',
      stories: storiesResult.status === 'fulfilled',
      teachers: teachersResult.status === 'fulfilled',
      weeklyActivity: weeklyResult.status === 'fulfilled',
      announcements: announcementsResult.status === 'fulfilled',
      assessment: assessmentResult.status === 'fulfilled',
      parentRelationships: relationshipsResult.status === 'fulfilled',
      progression: Boolean(progression)
    },
    dharma: progression ? {
      available: true,
      dharmaPoints: progression.dharmaPoints,
      adharmaPoints: progression.adharmaPoints,
      effectiveDharma: progression.effectiveDharma,
      currentLoka: progression.currentLoka,
      lokas: progression.lokas,
      nextLoka: progression.nextLoka,
      adharmaPenalty: 'Each Adharma point reduces effective Loka Dharma by 2; earned unlocks remain permanent.'
    } : { available: false, reason: 'Point progression could not be loaded.' },
    ashram: progression ? { available: true, ...progression.ashram } : { available: false, reason: 'Ashram progression could not be loaded.' },
    lokaSystem: progression ? { available: true, currentLoka: progression.currentLoka, lokas: progression.lokas, nextLoka: progression.nextLoka }
      : { available: false, lokas: [], reason: 'Loka progression could not be loaded.' },
    village: { available: false },
    funMode: { available: false },
    dharmaSituations: { available: false },
    parentRelationships: relationshipsResult.status === 'fulfilled'
      ? { available: true, ...relationshipsResult.value }
      : { available: false, relationships: [], invitations: [] }
  };
}

module.exports = { getDashboard, getWeeklyActivity, localDaySequence };
