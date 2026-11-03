const mongoose = require('mongoose');

const completedLessonSchema = new mongoose.Schema({
  chapterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
  completedAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const learningProgressSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  story: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LearningContent',
    required: true
  },
  completedLessons: {
    type: [completedLessonSchema],
    default: []
  },
  lastAccessedChapterId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  lastAccessedLessonId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  lastAccessedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

learningProgressSchema.index({ student: 1, story: 1 }, { unique: true });
learningProgressSchema.index({ student: 1, lastAccessedAt: -1 });

module.exports = mongoose.models.LearningProgress
  || mongoose.model('LearningProgress', learningProgressSchema);
