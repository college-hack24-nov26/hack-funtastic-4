const Teacher = require('../models/teacher');

const EDITABLE_FIELDS = [
  'name', 'slug', 'identityType', 'title', 'shortIntroduction', 'mythologicalBackground',
  'personality', 'teachingPhilosophy', 'teachingDomain', 'knowledgeAndSkills', 'biography',
  'teachingStyle', 'portrait', 'sources', 'contentReviewStatus', 'ageGroups'
];

function adminError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handlePersistenceError(error) {
  if (error.code === 11000) return adminError('A teacher with this slug already exists.', 409);
  if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
    return adminError(error.message, 400);
  }
  return error;
}

async function safely(action) {
  try { return await action(); } catch (error) { throw handlePersistenceError(error); }
}

function lookup(slug) {
  return Teacher.findOne({ slug: slug.toLowerCase() });
}

async function listTeachers({ status = 'all', search = '' } = {}) {
  const filter = {};
  if (status !== 'all') filter.publicationStatus = status;
  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { slug: { $regex: escaped, $options: 'i' } }];
  }
  const [teachers, total, published, draft] = await Promise.all([
    Teacher.find(filter).select('name slug identityType title teachingDomain ageGroups.ageGroup ageGroups.modules.chapters.lessons publicationStatus contentReviewStatus updatedAt').sort({ name: 1 }).lean(),
    Teacher.countDocuments(filter),
    Teacher.countDocuments({ publicationStatus: 'published' }),
    Teacher.countDocuments({ publicationStatus: 'draft' })
  ]);
  return {
    teachers: teachers.map((teacher) => ({
      ...teacher,
      syllabusSummary: teacher.ageGroups.map((syllabus) => ({
        ageGroup: syllabus.ageGroup,
        modules: syllabus.modules.length,
        chapters: syllabus.modules.reduce((sum, module) => sum + module.chapters.length, 0),
        lessons: syllabus.modules.reduce((sum, module) => sum + module.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.lessons.length, 0), 0)
      }))
    })),
    stats: { total, published, draft }
  };
}

async function getTeacher(slug) {
  const teacher = await lookup(slug);
  if (!teacher) throw adminError('Teacher not found.', 404);
  return { teacher: teacher.toObject({ versionKey: false }) };
}

async function createTeacher(input) {
  return safely(async () => {
    const teacher = await Teacher.create({ ...input, publicationStatus: 'draft', contentReviewStatus: 'unreviewed' });
    return { teacher: teacher.toObject({ versionKey: false }) };
  });
}

async function updateTeacher(slug, input) {
  return safely(async () => {
    const teacher = await lookup(slug);
    if (!teacher) throw adminError('Teacher not found.', 404);
    for (const field of EDITABLE_FIELDS) if (field in input) teacher.set(field, input[field]);
    await teacher.save();
    return { teacher: teacher.toObject({ versionKey: false }) };
  });
}

async function setPublication(slug, publicationStatus) {
  return safely(async () => {
    const teacher = await lookup(slug);
    if (!teacher) throw adminError('Teacher not found.', 404);
    teacher.publicationStatus = publicationStatus;
    await teacher.save();
    return { teacher: teacher.toObject({ versionKey: false }) };
  });
}

module.exports = { createTeacher, getTeacher, listTeachers, setPublication, updateTeacher };
