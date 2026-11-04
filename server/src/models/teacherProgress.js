const mongoose = require('mongoose');

const AGE_GROUPS = ['6-8', '9-12', '13-15', '16-18', '18+'];

const teacherProgressSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  ageGroup: { type: String, enum: AGE_GROUPS, required: true },
  startedModuleIds: { type: [{ type: mongoose.Schema.Types.ObjectId }], default: [] },
  completedLessonIds: { type: [{ type: mongoose.Schema.Types.ObjectId }], default: [] },
  lastAccessedLessonId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastAccessedModuleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastAccessedChapterId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastAccessedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

teacherProgressSchema.index({ student: 1, teacher: 1, ageGroup: 1 }, { unique: true });
teacherProgressSchema.index({ student: 1, lastAccessedAt: -1 });

module.exports = mongoose.models.TeacherProgress
  || mongoose.model('TeacherProgress', teacherProgressSchema);
