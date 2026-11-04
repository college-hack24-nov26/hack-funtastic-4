const mongoose = require('mongoose');

const AGE_GROUPS = ['6-8', '9-12', '13-15', '16-18', '18+'];
const MODULE_TYPES = ['story', 'sixTeachers', 'fourteenLokas', 'dharmaSituations', 'library', 'studyMode'];
const DIFFICULTY_LEVELS = ['introductory', 'developing', 'advanced'];
const PUBLICATION_STATUSES = ['draft', 'published', 'archived'];

const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 160
  },
  order: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger
  },
  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 30000
  },
  contentFormat: {
    type: String,
    enum: ['plainText', 'markdown'],
    default: 'plainText'
  },
  learningObjectives: {
    type: [{ type: String, trim: true, minlength: 2, maxlength: 240 }],
    default: [],
    validate: { validator: (items) => items.length <= 20, message: 'A lesson can have at most 20 learning objectives.' }
  },
  estimatedMinutes: {
    type: Number,
    min: 1,
    max: 600,
    validate: { validator: Number.isInteger, message: 'Estimated minutes must be a whole number.' },
    default: 5
  }
}, { timestamps: true });

const chapterSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 160
  },
  summary: { type: String, trim: true, maxlength: 1000, default: '' },
  order: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger
  },
  estimatedMinutes: {
    type: Number,
    min: 1,
    max: 1200,
    validate: { validator: Number.isInteger, message: 'Estimated minutes must be a whole number.' },
    default: 10
  },
  lessons: {
    type: [lessonSchema],
    default: [],
    validate: { validator: (items) => items.length <= 50, message: 'A chapter can have at most 50 lessons.' }
  }
}, { timestamps: true });

function isSafeCoverImageReference(value) {
  if (!value) return true;
  if (value.startsWith('/assets/')) return !value.startsWith('//') && !value.includes('..');
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

const learningContentSchema = new mongoose.Schema({
  moduleType: {
    type: String,
    enum: MODULE_TYPES,
    required: true,
    default: 'story',
  },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and single hyphens.'],
    maxlength: 180
  },
  shortDescription: { type: String, required: true, trim: true, minlength: 5, maxlength: 320 },
  fullDescription: { type: String, required: true, trim: true, minlength: 10, maxlength: 8000 },
  mythologicalBackground: { type: String, required: true, trim: true, minlength: 10, maxlength: 12000 },
  coverImage: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
    validate: { validator: isSafeCoverImageReference, message: 'Cover image must be an /assets/ path or an HTTP(S) URL.' }
  },
  category: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  ageGroups: {
    type: [{ type: String, enum: AGE_GROUPS }],
    required: true,
    validate: [
      { validator: (items) => items.length > 0, message: 'At least one age group is required.' },
      { validator: (items) => new Set(items).size === items.length, message: 'Age groups must be unique.' }
    ]
  },
  difficulty: { type: String, required: true, enum: DIFFICULTY_LEVELS },
  learningObjectives: {
    type: [{ type: String, trim: true, minlength: 2, maxlength: 240 }],
    required: true,
    validate: [
      { validator: (items) => items.length > 0, message: 'At least one learning objective is required.' },
      { validator: (items) => items.length <= 20, message: 'A story can have at most 20 learning objectives.' }
    ]
  },
  estimatedMinutes: {
    type: Number,
    required: true,
    min: 1,
    max: 2400,
    validate: { validator: Number.isInteger, message: 'Estimated minutes must be a whole number.' }
  },
  publicationStatus: {
    type: String,
    enum: PUBLICATION_STATUSES,
    default: 'draft',
    required: true
  },
  chapters: {
    type: [chapterSchema],
    default: [],
    validate: { validator: (items) => items.length <= 100, message: 'A story can have at most 100 chapters.' }
  }
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false
});

learningContentSchema.pre('validate', function validatePublishedContent(next) {
  if (this.publicationStatus === 'published') {
    if (!this.chapters.length) {
      this.invalidate('chapters', 'Published content must have at least one chapter.');
    } else if (this.chapters.some((chapter) => chapter.lessons.length === 0)) {
      this.invalidate('chapters', 'Every chapter in published content must have at least one lesson.');
    }
  }

  const duplicateChapterOrder = this.chapters.some((chapter, index, chapters) =>
    chapters.findIndex((item) => item.order === chapter.order) !== index);
  if (duplicateChapterOrder) this.invalidate('chapters', 'Chapter order values must be unique within a story.');

  for (const chapter of this.chapters) {
    const duplicateLessonOrder = chapter.lessons.some((lesson, index, lessons) =>
      lessons.findIndex((item) => item.order === lesson.order) !== index);
    if (duplicateLessonOrder) this.invalidate('chapters', 'Lesson order values must be unique within each chapter.');
  }

  next();
});

learningContentSchema.index({ moduleType: 1, slug: 1 }, { unique: true });
learningContentSchema.index({ moduleType: 1, publicationStatus: 1, updatedAt: -1 });
learningContentSchema.index({ moduleType: 1, publicationStatus: 1, ageGroups: 1, updatedAt: -1 });

const LearningContent = mongoose.models.LearningContent
  || mongoose.model('LearningContent', learningContentSchema);

LearningContent.AGE_GROUPS = AGE_GROUPS;
LearningContent.MODULE_TYPES = MODULE_TYPES;
LearningContent.DIFFICULTY_LEVELS = DIFFICULTY_LEVELS;
LearningContent.PUBLICATION_STATUSES = PUBLICATION_STATUSES;

module.exports = LearningContent;
