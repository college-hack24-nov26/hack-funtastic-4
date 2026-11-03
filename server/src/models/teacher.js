const mongoose = require('mongoose');

const AGE_GROUPS = ['6-8', '9-12', '13-15', '16-18', '18+'];
const DIFFICULTIES = ['introductory', 'developing', 'advanced'];
const QUESTION_TYPES = ['multipleChoice', 'trueFalse', 'fillBlank', 'matching', 'shortAnswer'];
const IDENTITY_TYPES = ['teachingPersona', 'historicalScholar', 'traditionalPhilosopher', 'collective'];

const activitySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  instructions: { type: String, required: true, trim: true, minlength: 5, maxlength: 1600 },
  activityType: { type: String, enum: ['reflection', 'matching', 'observation', 'practice', 'discussion'], required: true }
}, { _id: true, strict: 'throw' });

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  order: { type: Number, required: true, min: 1, validate: Number.isInteger },
  introduction: { type: String, required: true, trim: true, minlength: 5, maxlength: 1800 },
  content: { type: String, required: true, trim: true, minlength: 30, maxlength: 30000 },
  narrativeContext: { type: String, trim: true, maxlength: 5000, default: '' },
  keyConcepts: { type: [{ type: String, trim: true, minlength: 2, maxlength: 180 }], default: [], validate: (items) => items.length <= 20 },
  realLifeApplication: { type: String, trim: true, maxlength: 2500, default: '' },
  takeaways: { type: [{ type: String, trim: true, minlength: 2, maxlength: 240 }], default: [], validate: (items) => items.length <= 20 },
  learningObjectives: { type: [{ type: String, trim: true, minlength: 2, maxlength: 240 }], default: [], validate: (items) => items.length <= 20 },
  estimatedMinutes: { type: Number, min: 1, max: 180, default: 8, validate: Number.isInteger },
  activities: { type: [activitySchema], default: [], validate: (items) => items.length <= 10 }
}, { timestamps: true, strict: 'throw' });

const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true, minlength: 5, maxlength: 1200 },
  type: { type: String, enum: QUESTION_TYPES, required: true },
  options: { type: [{ key: { type: String, required: true, trim: true, maxlength: 24 }, text: { type: String, required: true, trim: true, maxlength: 400 } }], default: [], validate: (items) => items.length <= 8 },
  correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
  acceptedAnswers: { type: [{ type: String, trim: true, maxlength: 400 }], default: [] },
  explanation: { type: String, required: true, trim: true, minlength: 5, maxlength: 1200 },
  marks: { type: Number, required: true, min: 1, max: 20, default: 1, validate: Number.isInteger }
}, { _id: true, strict: 'throw' });

questionSchema.pre('validate', function validateQuestion(next) {
  const keys = this.options.map((option) => option.key);
  if (new Set(keys).size !== keys.length) this.invalidate('options', 'Question option keys must be unique.');
  if (this.type === 'multipleChoice') {
    if (this.options.length < 2 || typeof this.correctAnswer !== 'string' || !keys.includes(this.correctAnswer)) {
      this.invalidate('correctAnswer', 'Multiple-choice questions need at least two options and a valid answer key.');
    }
  } else if (this.type === 'trueFalse' && typeof this.correctAnswer !== 'boolean') {
    this.invalidate('correctAnswer', 'True-or-false answers must be boolean.');
  } else if (['fillBlank', 'shortAnswer'].includes(this.type) && typeof this.correctAnswer !== 'string') {
    this.invalidate('correctAnswer', 'Text answers must be strings.');
  } else if (this.type === 'matching') {
    if (!this.options.length || !this.correctAnswer || typeof this.correctAnswer !== 'object' || Array.isArray(this.correctAnswer)
      || keys.some((key) => typeof this.correctAnswer[key] !== 'string')) {
      this.invalidate('correctAnswer', 'Matching questions need an answer for every option.');
    }
  }
  next();
});

const assessmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  instructions: { type: String, required: true, trim: true, minlength: 5, maxlength: 1200 },
  passingPercent: { type: Number, min: 1, max: 100, default: 60, validate: Number.isInteger },
  timeLimitMinutes: { type: Number, min: 1, max: 180, default: null },
  questions: { type: [questionSchema], default: [], validate: (items) => items.length <= 50 }
}, { _id: true, strict: 'throw' });

const chapterSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  summary: { type: String, trim: true, maxlength: 1200, default: '' },
  order: { type: Number, required: true, min: 1, validate: Number.isInteger },
  lessons: { type: [lessonSchema], default: [], validate: (items) => items.length <= 30 },
  assessment: { type: assessmentSchema, default: null }
}, { timestamps: true, strict: 'throw' });

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  description: { type: String, required: true, trim: true, minlength: 5, maxlength: 1600 },
  order: { type: Number, required: true, min: 1, validate: Number.isInteger },
  chapters: { type: [chapterSchema], default: [], validate: (items) => items.length <= 30 },
  assessment: { type: assessmentSchema, default: null }
}, { timestamps: true, strict: 'throw' });

const syllabusSchema = new mongoose.Schema({
  ageGroup: { type: String, enum: AGE_GROUPS, required: true },
  difficulty: { type: String, enum: DIFFICULTIES, required: true },
  learningObjectives: { type: [{ type: String, trim: true, minlength: 2, maxlength: 240 }], required: true, validate: (items) => items.length > 0 && items.length <= 20 },
  estimatedMinutes: { type: Number, min: 1, max: 20000, default: 60, validate: Number.isInteger },
  modules: { type: [moduleSchema], default: [], validate: (items) => items.length <= 30 }
}, { _id: true, strict: 'throw' });

const sourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  reference: { type: String, required: true, trim: true, maxlength: 500 },
  note: { type: String, trim: true, maxlength: 1000, default: '' }
}, { _id: false, strict: 'throw' });

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, maxlength: 100 },
  identityType: { type: String, enum: IDENTITY_TYPES, required: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  shortIntroduction: { type: String, required: true, trim: true, minlength: 10, maxlength: 600 },
  mythologicalBackground: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  personality: { type: String, required: true, trim: true, minlength: 5, maxlength: 2500 },
  teachingPhilosophy: { type: String, required: true, trim: true, minlength: 5, maxlength: 2500 },
  teachingDomain: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  knowledgeAndSkills: { type: [{ type: String, trim: true, minlength: 2, maxlength: 180 }], required: true, validate: (items) => items.length > 0 && items.length <= 20 },
  biography: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  teachingStyle: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
  portrait: { type: String, trim: true, maxlength: 500, default: '' },
  sources: { type: [sourceSchema], default: [], validate: (items) => items.length <= 30 },
  contentReviewStatus: { type: String, enum: ['unreviewed', 'reviewed'], default: 'unreviewed' },
  ageGroups: { type: [syllabusSchema], default: [], validate: (items) => items.length <= 5 },
  publicationStatus: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', required: true }
}, { timestamps: true, versionKey: false, strict: 'throw' });

teacherSchema.pre('validate', function validateTeacher(next) {
  const duplicateAgeGroup = this.ageGroups.some((path, index, paths) => paths.findIndex((item) => item.ageGroup === path.ageGroup) !== index);
  if (duplicateAgeGroup) this.invalidate('ageGroups', 'Each age group can have only one syllabus.');

  for (const syllabus of this.ageGroups) {
    if (syllabus.modules.some((module, index, modules) => modules.findIndex((item) => item.order === module.order) !== index)) {
      this.invalidate('ageGroups', 'Module order values must be unique within an age group.');
    }
    for (const module of syllabus.modules) {
      if (module.chapters.some((chapter, index, chapters) => chapters.findIndex((item) => item.order === chapter.order) !== index)) {
        this.invalidate('ageGroups', 'Chapter order values must be unique within each module.');
      }
      for (const chapter of module.chapters) {
        if (chapter.lessons.some((lesson, index, lessons) => lessons.findIndex((item) => item.order === lesson.order) !== index)) {
          this.invalidate('ageGroups', 'Lesson order values must be unique within each chapter.');
        }
      }
    }
  }

  if (this.publicationStatus === 'published') {
    if (this.contentReviewStatus !== 'reviewed') this.invalidate('contentReviewStatus', 'Teacher content must be reviewed before publication.');
    if (this.ageGroups.length !== AGE_GROUPS.length || AGE_GROUPS.some((group) => !this.ageGroups.some((path) => path.ageGroup === group))) {
      this.invalidate('ageGroups', 'Published teachers require a syllabus for all five age groups.');
    }
    for (const syllabus of this.ageGroups) {
      if (!syllabus.modules.length || syllabus.modules.some((module) => !module.chapters.length)) {
        this.invalidate('ageGroups', `Published ${syllabus.ageGroup} syllabuses require modules and chapters.`);
      }
      if (syllabus.modules.some((module) => module.chapters.some((chapter) => !chapter.lessons.length || !chapter.assessment?.questions.length))) {
        this.invalidate('ageGroups', `Every published ${syllabus.ageGroup} chapter requires lessons and an assessment.`);
      }
    }
  }
  next();
});

teacherSchema.index({ publicationStatus: 1, 'ageGroups.ageGroup': 1, updatedAt: -1 });

const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema);
Teacher.AGE_GROUPS = AGE_GROUPS;
Teacher.IDENTITY_TYPES = IDENTITY_TYPES;
Teacher.DIFFICULTIES = DIFFICULTIES;
Teacher.QUESTION_TYPES = QUESTION_TYPES;

module.exports = Teacher;
