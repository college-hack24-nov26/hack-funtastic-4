require('dotenv').config();

const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const mongoose = require('mongoose');

// Prevent model auto-index/auto-create behavior from making dry-run mode write.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const connectDatabase = require('../src/config/database');
const teacherProfiles = require('../src/data/teacherProfiles');
const Teacher = require('../src/models/teacher');
const TeacherProgress = require('../src/models/teacherProgress');
const User = require('../src/models/user');

const CONFIRMATION_PHRASE = 'APPLY MYTHOVERSE TEACHER RECONCILIATION';
const SUPPORTED_AGE_GROUPS = Teacher.AGE_GROUPS;
const PROFILE_BY_NAME = new Map(teacherProfiles.map((profile) => [profile.name, profile]));
const PROFILE_BY_SLUG = new Map(teacherProfiles.map((profile) => [profile.slug, profile]));
const LEGACY_KEY_TO_SLUG = new Map([
  ...teacherProfiles.map((profile) => [profile.slug, profile.slug]),
  ['kanad', 'kanada']
]);
const REQUIRED_LEGACY_TEACHER_FIELDS = ['subject', 'description', 'guideCharacter', 'imageUrl', 'active'];
const REQUIRED_LEGACY_PROGRESS_FIELDS = ['user', 'teacherKey', 'teacherName', 'description', 'subjects'];
const CURRENT_PROGRESS_ARRAYS = ['startedModuleIds', 'completedLessonIds'];
const CURRENT_PROGRESS_NULLABLES = ['lastAccessedLessonId', 'lastAccessedModuleId', 'lastAccessedChapterId', 'lastAccessedAt'];
const EXPECTED_TEACHER_COUNT = teacherProfiles.length;
const EXPECTED_PROGRESS_COUNT = teacherProfiles.length;

class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationError';
  }
}

function fail(message) {
  throw new MigrationError(message);
}

function stableKey(value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  return String(value);
}

function stableSerialize(value) {
  if (value instanceof mongoose.Types.ObjectId) return { $objectId: value.toHexString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(stableSerialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSerialize(value[key])]));
  }
  return value;
}

function indexHas(index, expectedKey, unique) {
  if (!index || Boolean(index.unique) !== unique) return false;
  const actualEntries = Object.entries(index.key || {});
  const expectedEntries = Object.entries(expectedKey);
  return actualEntries.length === expectedEntries.length
    && expectedEntries.every(([key, value], position) => actualEntries[position]?.[0] === key && actualEntries[position]?.[1] === value);
}

function findIndexByName(indexes, name, expectedKey, unique) {
  const named = indexes.find((index) => index.name === name);
  if (named && !indexHas(named, expectedKey, unique)) fail(`Index ${name} exists with an unexpected definition.`);
  return named || null;
}

function findIndexByKey(indexes, expectedKey, unique) {
  const matches = indexes.filter((index) => indexHas(index, expectedKey, unique));
  if (matches.length > 1) fail('Multiple indexes have the same current-schema definition.');
  return matches[0] || null;
}

function indexSnapshot(indexes) {
  return indexes.map((index) => ({ name: index.name, key: index.key, unique: Boolean(index.unique) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function requiredPaths(error) {
  return Object.keys(error.errors || {}).sort();
}

async function validateTeacherDocument(document) {
  // Legacy fields such as `subject` and `imageUrl` are deliberately retained in
  // MongoDB for compatibility, but strict:'throw' means they cannot be passed
  // into the current Mongoose document constructor for validation.
  const schemaFields = new Set(Object.keys(Teacher.schema.paths).map((path) => path.split('.')[0]));
  const currentFields = Object.fromEntries(Object.entries(document).filter(([field]) => schemaFields.has(field)));
  const candidate = new Teacher(currentFields);
  try {
    await candidate.validate();
  } catch (error) {
    const paths = requiredPaths(error);
    fail(`Teacher ${document.name || '(unnamed)'} is not valid under the current model${paths.length ? ` (${paths.join(', ')})` : ''}.`);
  }
}

async function validateProgressDocument(document) {
  const candidate = new TeacherProgress({
    _id: document._id,
    student: document.student,
    teacher: document.teacher,
    ageGroup: document.ageGroup,
    startedModuleIds: document.startedModuleIds,
    completedLessonIds: document.completedLessonIds,
    lastAccessedLessonId: document.lastAccessedLessonId,
    lastAccessedModuleId: document.lastAccessedModuleId,
    lastAccessedChapterId: document.lastAccessedChapterId,
    lastAccessedAt: document.lastAccessedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  });
  try {
    await candidate.validate();
  } catch (error) {
    const paths = requiredPaths(error);
    fail(`A teacher progress record is not valid under the current model${paths.length ? ` (${paths.join(', ')})` : ''}.`);
  }
}

function profileForProgress(progress) {
  const slug = LEGACY_KEY_TO_SLUG.get(progress.teacherKey);
  if (!slug) fail('A progress record has an unknown canonical teacher key.');
  const profile = PROFILE_BY_SLUG.get(slug);
  if (!profile) fail('A progress record cannot be matched to a canonical teacher.');
  return profile;
}

function legacyProgressHasUnexpectedData(progress) {
  return (Array.isArray(progress.subjects) && progress.subjects.length > 0)
    || (Array.isArray(progress.lessons) && progress.lessons.length > 0)
    || (typeof progress.studySeconds === 'number' && progress.studySeconds > 0)
    || progress.completed === true
    || Boolean(progress.completedAt);
}

async function getIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function inspectMigration() {
  const database = mongoose.connection.db;
  if (!database || mongoose.connection.readyState !== 1) fail('The configured MongoDB connection is not ready.');

  const teachersCollection = Teacher.collection;
  const progressCollection = TeacherProgress.collection;
  const teachers = await teachersCollection.find({}).toArray();
  const progressRecords = await progressCollection.find({}).toArray();
  const teacherChaptersCollection = database.collection('teacherchapters');
  const attemptsCollection = database.collection('teacherassessmentattempts');
  const [teacherIndexes, progressIndexes, chapterIndexes, attemptIndexes] = await Promise.all([
    getIndexes(teachersCollection), getIndexes(progressCollection),
    getIndexes(teacherChaptersCollection), getIndexes(attemptsCollection)
  ]);

  const names = new Map();
  for (const teacher of teachers) names.set(teacher.name, (names.get(teacher.name) || 0) + 1);
  const duplicateNames = [...names.entries()].filter(([, count]) => count !== 1).map(([name]) => name);
  if (duplicateNames.length) fail(`Duplicate teacher names detected: ${duplicateNames.join(', ')}.`);
  const missingNames = teacherProfiles.filter((profile) => !names.has(profile.name)).map((profile) => profile.name);
  const unexpectedNames = teachers.filter((teacher) => !PROFILE_BY_NAME.has(teacher.name)).map((teacher) => teacher.name || '(unnamed)');
  if (missingNames.length || unexpectedNames.length) {
    fail(`Canonical teacher matching failed. Missing: ${missingNames.join(', ') || 'none'}; unexpected: ${unexpectedNames.join(', ') || 'none'}.`);
  }
  if (teachers.length !== EXPECTED_TEACHER_COUNT) {
    fail(`Expected exactly ${EXPECTED_TEACHER_COUNT} teacher records; found ${teachers.length}. No changes are safe.`);
  }

  const teacherBySlug = new Map();
  const teacherActions = [];
  const plannedTeacherUpdates = new Map();
  for (const profile of teacherProfiles) {
    const document = teachers.find((teacher) => teacher.name === profile.name);
    if (document.slug && document.slug !== profile.slug) {
      fail(`Teacher ${profile.name} has a non-canonical slug; manual review is required.`);
    }
    const matchingSlug = teachers.filter((teacher) => teacher.slug === profile.slug);
    if (matchingSlug.length > 1 || (matchingSlug.length === 1 && stableKey(matchingSlug[0]._id) !== stableKey(document._id))) {
      fail(`Duplicate canonical slug detected for ${profile.name}.`);
    }

    if (!document.slug) {
      const hasCurrentFields = ['publicationStatus', 'identityType', 'title', 'shortIntroduction', 'ageGroups']
        .some((field) => Object.hasOwn(document, field));
      if (hasCurrentFields) fail(`Teacher ${profile.name} is partially migrated; manual review is required.`);
      for (const field of REQUIRED_LEGACY_TEACHER_FIELDS) {
        if (!Object.hasOwn(document, field)) fail(`Teacher ${profile.name} is missing legacy field ${field}.`);
      }
      const update = { ...profile, slug: profile.slug, publicationStatus: 'draft', contentReviewStatus: 'unreviewed' };
      await validateTeacherDocument({ ...document, ...update, _id: document._id });
      plannedTeacherUpdates.set(stableKey(document._id), update);
      teacherActions.push({ name: profile.name, slug: profile.slug, action: 'update-in-place' });
    } else {
      await validateTeacherDocument(document);
      if (!['draft', 'published', 'archived'].includes(document.publicationStatus)) {
        fail(`Teacher ${profile.name} has an invalid publication status.`);
      }
      teacherActions.push({ name: profile.name, slug: profile.slug, action: 'already-migrated-preserve-content' });
    }
    teacherBySlug.set(profile.slug, { ...document, ...plannedTeacherUpdates.get(stableKey(document._id)) });
  }

  const slugIndex = findIndexByName(teacherIndexes, 'slug_1', { slug: 1 }, true)
    || findIndexByKey(teacherIndexes, { slug: 1 }, true);
  const nameIndex = findIndexByName(teacherIndexes, 'name_1', { name: 1 }, true);
  if (teacherIndexes.some((index) => index.name !== '_id_' && Object.hasOwn(index.key || {}, 'slug') && !indexHas(index, { slug: 1 }, true))) {
    fail('A conflicting slug index exists. No index changes are safe.');
  }
  const teacherIndexActions = [];
  if (!slugIndex) teacherIndexActions.push({ action: 'create', name: 'slug_1', unique: true });
  if (nameIndex) teacherIndexActions.push({ action: 'drop-after-slug-verification', name: 'name_1', unique: true });

  const progressByKey = new Map();
  for (const record of progressRecords) {
    const profile = profileForProgress(record);
    if (progressByKey.has(profile.slug)) fail(`Duplicate progress records exist for ${profile.name}.`);
    progressByKey.set(profile.slug, record);
  }
  if (progressRecords.length !== EXPECTED_PROGRESS_COUNT) {
    fail(`Expected exactly ${EXPECTED_PROGRESS_COUNT} teacher progress records; found ${progressRecords.length}. No changes are safe.`);
  }
  const missingProgress = teacherProfiles.filter((profile) => !progressByKey.has(profile.slug)).map((profile) => profile.name);
  if (missingProgress.length) fail(`Progress records are missing for: ${missingProgress.join(', ')}.`);

  const userIds = [...new Map(progressRecords.filter((record) => record.user).map((record) => [stableKey(record.user), record.user])).values()];
  if (userIds.length !== 1) fail('Teacher progress records do not reference exactly one student.');
  const student = await User.collection.findOne({ _id: userIds[0] }, { projection: { role: 1, ageGroup: 1 } });
  if (!student || student.role !== 'student') fail('The legacy progress student reference is missing or is not a student.');
  if (!SUPPORTED_AGE_GROUPS.includes(student.ageGroup)) fail('The referenced student has no supported current age group.');

  const progressActions = [];
  const plannedProgressUpdates = new Map();
  const currentUniqueKeys = new Set();
  for (const profile of teacherProfiles) {
    const record = progressByKey.get(profile.slug);
    if (!record.user || !record.teacherKey) fail(`Progress for ${profile.name} is missing legacy reference fields.`);
    for (const field of REQUIRED_LEGACY_PROGRESS_FIELDS) {
      if (!Object.hasOwn(record, field)) fail(`Progress for ${profile.name} is missing legacy field ${field}.`);
    }
    if (!Array.isArray(record.subjects)) fail(`Progress for ${profile.name} has an invalid legacy subjects field.`);
    if (legacyProgressHasUnexpectedData(record)) {
      fail(`Progress for ${profile.name} contains lesson, subject, study-time, or completion data that needs manual mapping.`);
    }

    const expectedTeacher = teacherBySlug.get(profile.slug);
    const refs = { student: record.user, teacher: expectedTeacher._id, ageGroup: student.ageGroup };
    for (const field of ['student', 'teacher', 'ageGroup']) {
      if (Object.hasOwn(record, field) && stableKey(record[field]) !== stableKey(refs[field])) {
        fail(`Progress for ${profile.name} has a conflicting current ${field} reference.`);
      }
    }
    const currentKey = `${stableKey(refs.student)}|${stableKey(refs.teacher)}|${refs.ageGroup}`;
    if (currentUniqueKeys.has(currentKey)) fail('Duplicate current (student, teacher, ageGroup) progress combinations were detected.');
    currentUniqueKeys.add(currentKey);

    const update = {};
    for (const [field, value] of Object.entries(refs)) if (!Object.hasOwn(record, field)) update[field] = value;
    for (const field of CURRENT_PROGRESS_ARRAYS) {
      if (Object.hasOwn(record, field) && !Array.isArray(record[field])) fail(`Progress for ${profile.name} has an invalid ${field} field.`);
      if (!Object.hasOwn(record, field)) update[field] = [];
    }
    for (const field of CURRENT_PROGRESS_NULLABLES) if (!Object.hasOwn(record, field)) update[field] = null;
    await validateProgressDocument({ ...record, ...update });
    plannedProgressUpdates.set(stableKey(record._id), update);
    progressActions.push({ teacher: profile.name, action: Object.keys(update).length ? 'add-current-fields-preserve-legacy' : 'already-migrated-preserve-progress' });
  }

  const currentProgressIndex = findIndexByName(progressIndexes, 'student_1_teacher_1_ageGroup_1', { student: 1, teacher: 1, ageGroup: 1 }, true)
    || findIndexByKey(progressIndexes, { student: 1, teacher: 1, ageGroup: 1 }, true);
  const legacyProgressIndex = findIndexByName(progressIndexes, 'user_1_teacherKey_1', { user: 1, teacherKey: 1 }, true);
  if (progressIndexes.some((index) => index.name !== '_id_' && Object.hasOwn(index.key || {}, 'student') && Object.hasOwn(index.key || {}, 'teacher') && Object.hasOwn(index.key || {}, 'ageGroup') && !indexHas(index, { student: 1, teacher: 1, ageGroup: 1 }, true))) {
    fail('A conflicting current progress index exists. No index changes are safe.');
  }
  const progressIndexActions = [];
  if (!currentProgressIndex) progressIndexActions.push({ action: 'create', name: 'student_1_teacher_1_ageGroup_1', unique: true });
  if (legacyProgressIndex) progressIndexActions.push({ action: 'drop-after-current-index-verification', name: 'user_1_teacherKey_1', unique: true });

  const otherCollections = {
    teacherchapters: {
      count: await teacherChaptersCollection.countDocuments(),
      indexes: indexSnapshot(chapterIndexes)
    },
    teacherassessmentattempts: {
      count: await attemptsCollection.countDocuments(),
      indexes: indexSnapshot(attemptIndexes)
    }
  };

  const before = { teachers: teachers.length, progress: progressRecords.length };
  const summary = {
    beforeCounts: before,
    afterCounts: before,
    canonicalTeachers: teacherActions,
    progressRecords: progressActions,
    resolvedStudentReferences: userIds.length,
    teacherIndexes: teacherIndexActions,
    progressIndexes: progressIndexActions,
    retainedIndexes: {
      teacherPublicationAgeGroupUpdatedAt: Boolean(teacherIndexes.find((index) => index.name === 'publicationStatus_1_ageGroups.ageGroup_1_updatedAt_-1')),
      progressUserLookup: Boolean(progressIndexes.find((index) => index.name === 'user_1'))
    },
    untouchedCollections: otherCollections
  };
  const fingerprintInput = {
    teacherDocuments: teachers.map(stableSerialize).sort((a, b) => a._id.$objectId.localeCompare(b._id.$objectId)),
    progressDocuments: progressRecords.map(stableSerialize).sort((a, b) => a._id.$objectId.localeCompare(b._id.$objectId)),
    studentState: stableSerialize({ userId: userIds[0], role: student.role, ageGroup: student.ageGroup }),
    plannedTeacherUpdates: stableSerialize([...plannedTeacherUpdates.entries()].sort(([a], [b]) => a.localeCompare(b))),
    plannedProgressUpdates: stableSerialize([...plannedProgressUpdates.entries()].sort(([a], [b]) => a.localeCompare(b))),
    teacherIndexSnapshot: indexSnapshot(teacherIndexes),
    progressIndexSnapshot: indexSnapshot(progressIndexes),
    summary
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');

  return {
    summary,
    fingerprint,
    teachers,
    progressRecords,
    teacherActions,
    progressActions,
    plannedTeacherUpdates,
    plannedProgressUpdates,
    otherCollections,
    teacherIndexes: indexSnapshot(teacherIndexes),
    progressIndexes: indexSnapshot(progressIndexes)
  };
}

function printPlan(plan, output = console) {
  output.log('Read-only migration plan:');
  output.log(JSON.stringify(plan.summary, null, 2));
  output.log(`Plan fingerprint: ${plan.fingerprint}`);
  output.log('No database writes were performed.');
}

async function dryRun({ output = console } = {}) {
  const plan = await inspectMigration();
  printPlan(plan, output);
  return plan;
}

async function askConfirmation(input = process.stdin, output = process.stdout) {
  const interfaceHandle = readline.createInterface({ input, output });
  try {
    const answer = await interfaceHandle.question(`Type exactly "${CONFIRMATION_PHRASE}" to continue: `);
    return answer;
  } finally {
    interfaceHandle.close();
  }
}

async function applyMigration({ planHash, confirm = askConfirmation, output = console } = {}) {
  if (typeof planHash !== 'string' || !/^[a-f0-9]{64}$/.test(planHash)) {
    fail('Apply requires the plan fingerprint printed by a successful --dry-run.');
  }
  const displayedPlan = await inspectMigration();
  printPlan(displayedPlan, output);
  if (displayedPlan.fingerprint !== planHash) fail('The database differs from the supplied dry-run fingerprint; rerun --dry-run.');
  const answer = await confirm();
  if (answer !== CONFIRMATION_PHRASE) fail('Confirmation phrase did not match; no changes were made.');

  // Re-read and revalidate after confirmation, immediately before the first write.
  const plan = await inspectMigration();
  if (plan.fingerprint !== planHash) fail('The database changed after confirmation; rerun --dry-run.');
  const database = mongoose.connection.db;
  const teachersCollection = Teacher.collection;
  const progressCollection = TeacherProgress.collection;

  for (const profile of teacherProfiles) {
    const document = plan.teachers.find((teacher) => teacher.name === profile.name);
    const update = plan.plannedTeacherUpdates.get(stableKey(document._id));
    if (!update) continue;
    const result = await teachersCollection.updateOne(
      { _id: document._id, name: profile.name, slug: { $exists: false } },
      { $set: update }
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      fail(`Teacher ${profile.name} changed while applying the migration; stop and rerun --dry-run.`);
    }
  }

  for (const profile of teacherProfiles) {
    const legacyKey = profile.slug === 'kanada' ? 'kanad' : profile.slug;
    const record = plan.progressRecords.find((item) => item.teacherKey === legacyKey || item.teacherKey === profile.slug);
    const update = plan.plannedProgressUpdates.get(stableKey(record._id));
    if (!Object.keys(update).length) continue;
    const result = await progressCollection.updateOne(
      { _id: record._id, user: record.user, teacherKey: record.teacherKey },
      { $set: update }
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      fail(`Progress for ${profile.name} changed while applying the migration; stop and rerun --dry-run.`);
    }
  }

  await ensureUniqueIndex(teachersCollection, { slug: 1 }, 'slug_1');
  await ensureUniqueIndex(progressCollection, { student: 1, teacher: 1, ageGroup: 1 }, 'student_1_teacher_1_ageGroup_1');

  const verifiedTeacherIndexes = await getIndexes(teachersCollection);
  if (!findIndexByKey(verifiedTeacherIndexes, { slug: 1 }, true)) fail('The unique teacher slug index could not be verified; legacy indexes were retained.');
  const verifiedProgressIndexes = await getIndexes(progressCollection);
  if (!findIndexByKey(verifiedProgressIndexes, { student: 1, teacher: 1, ageGroup: 1 }, true)) fail('The current unique progress index could not be verified; legacy indexes were retained.');

  await dropLegacyIndexIfPresent(teachersCollection, verifiedTeacherIndexes, 'name_1', { name: 1 });
  await dropLegacyIndexIfPresent(progressCollection, verifiedProgressIndexes, 'user_1_teacherKey_1', { user: 1, teacherKey: 1 });

  const postTeacherDocs = await teachersCollection.find({}).toArray();
  const postProgressDocs = await progressCollection.find({}).toArray();
  if (postTeacherDocs.length !== plan.summary.beforeCounts.teachers || postProgressDocs.length !== plan.summary.beforeCounts.progress) {
    fail('Post-migration record counts changed unexpectedly. Do not continue; use the backup and recovery plan.');
  }
  const originalTeacherIds = new Set(plan.teachers.map((doc) => stableKey(doc._id)));
  const originalProgressIds = new Set(plan.progressRecords.map((doc) => stableKey(doc._id)));
  if (postTeacherDocs.some((doc) => !originalTeacherIds.has(stableKey(doc._id)))
    || postProgressDocs.some((doc) => !originalProgressIds.has(stableKey(doc._id)))) {
    fail('A teacher or progress document ID changed unexpectedly.');
  }
  for (const name of ['teacherchapters', 'teacherassessmentattempts']) {
    const collection = database.collection(name);
    const before = plan.otherCollections[name];
    const afterCount = await collection.countDocuments();
    const afterIndexes = indexSnapshot(await getIndexes(collection));
    if (afterCount !== before.count || JSON.stringify(afterIndexes) !== JSON.stringify(before.indexes)) {
      fail(`Untouched collection ${name} changed during migration.`);
    }
  }

  output.log(JSON.stringify({
    result: 'applied',
    recordsBeforeAndAfter: plan.summary.beforeCounts,
    teacherIdsPreserved: true,
    progressIdsPreserved: true,
    legacyFieldsPreserved: true,
    dharmaPointsChanged: false,
    teacherSlugIndex: 'verified unique',
    currentProgressIndex: 'verified unique',
    untouchedCollectionsVerified: ['teacherchapters', 'teacherassessmentattempts']
  }, null, 2));
  return { result: 'applied', summary: plan.summary };
}

async function ensureUniqueIndex(collection, key, name) {
  const indexes = await getIndexes(collection);
  const named = indexes.find((index) => index.name === name);
  if (named) {
    if (!indexHas(named, key, true)) fail(`Index ${name} has an unexpected definition.`);
    return;
  }
  const byKey = findIndexByKey(indexes, key, true);
  if (byKey) return;
  if (indexes.some((index) => index.name !== '_id_' && Object.keys(index.key || {}).length === Object.keys(key).length
    && Object.keys(key).every((field) => Object.hasOwn(index.key || {}, field)))) {
    fail(`A conflicting index exists for ${Object.keys(key).join(', ')}.`);
  }
  await collection.createIndex(key, { unique: true, name });
}

async function dropLegacyIndexIfPresent(collection, indexes, name, expectedKey) {
  const index = indexes.find((item) => item.name === name);
  if (!index) return;
  if (!indexHas(index, expectedKey, true)) fail(`Legacy index ${name} changed unexpectedly; it was not dropped.`);
  await collection.dropIndex(name);
}

async function verifyMigration({ output = console } = {}) {
  const plan = await inspectMigration();
  const problems = [];
  const teacherIndexes = await getIndexes(Teacher.collection);
  const progressIndexes = await getIndexes(TeacherProgress.collection);
  if (!findIndexByKey(teacherIndexes, { slug: 1 }, true)) problems.push('unique teacher slug index missing');
  if (teacherIndexes.some((index) => index.name === 'name_1')) problems.push('legacy unique name index remains');
  if (!findIndexByKey(progressIndexes, { student: 1, teacher: 1, ageGroup: 1 }, true)) problems.push('current unique progress index missing');
  if (progressIndexes.some((index) => index.name === 'user_1_teacherKey_1')) problems.push('legacy unique progress index remains');
  for (const document of plan.teachers) {
    if (document.publicationStatus !== 'draft') problems.push(`teacher ${document.name} is not a draft`);
    if (!REQUIRED_LEGACY_TEACHER_FIELDS.every((field) => Object.hasOwn(document, field))) problems.push(`teacher ${document.name} has missing legacy metadata`);
  }
  for (const record of plan.progressRecords) {
    if (!REQUIRED_LEGACY_PROGRESS_FIELDS.every((field) => Object.hasOwn(record, field))) problems.push('a progress record has missing legacy metadata');
    if (!record.student || !record.teacher || !SUPPORTED_AGE_GROUPS.includes(record.ageGroup)) problems.push('a progress record has invalid current references');
  }
  if (problems.length) fail(`Verification failed: ${problems.join('; ')}.`);
  const result = {
    result: 'verified',
    teacherCount: plan.summary.beforeCounts.teachers,
    progressCount: plan.summary.beforeCounts.progress,
    canonicalSlugs: teacherProfiles.map((profile) => profile.slug),
    allTeachersDraft: true,
    legacyFieldsPreserved: true,
    progressReferencesValid: true,
    rewardsChanged: false,
    indexes: 'verified',
    untouchedCollections: plan.otherCollections
  };
  output.log(JSON.stringify(result, null, 2));
  return result;
}

function parseArguments(args) {
  const modes = args.filter((argument) => ['--dry-run', '--apply', '--verify'].includes(argument));
  if (modes.length !== 1 || args.some((argument) => !['--dry-run', '--apply', '--verify'].includes(argument) && !argument.startsWith('--plan-hash='))) {
    fail('Choose exactly one of --dry-run, --apply, or --verify.');
  }
  const planArgument = args.find((argument) => argument.startsWith('--plan-hash='));
  return {
    mode: modes[0].slice(2),
    planHash: planArgument ? planArgument.slice('--plan-hash='.length) : undefined
  };
}

async function main(args = process.argv.slice(2)) {
  let connected = false;
  try {
    const { mode, planHash } = parseArguments(args);
    if (!process.env.MONGODB_URI) fail('MONGODB_URI is not configured.');
    await connectDatabase(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
    connected = true;
    if (mode === 'dry-run') await dryRun();
    else if (mode === 'verify') await verifyMigration();
    else await applyMigration({ planHash });
  } finally {
    if (connected && mongoose.connection.readyState) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof MigrationError) console.error(error.message);
    else console.error(`Teacher reconciliation failed (${error.name || 'Error'}). No connection details or record identifiers are shown.`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION_PHRASE,
  MigrationError,
  applyMigration,
  dryRun,
  inspectMigration,
  main,
  parseArguments,
  verifyMigration
};
