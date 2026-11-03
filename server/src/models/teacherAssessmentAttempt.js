const mongoose = require('mongoose');

const teacherAssessmentAttemptSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  ageGroup: { type: String, enum: ['6-8', '9-12', '13-15', '16-18', '18+'], required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  submissionKey: { type: String, required: true, minlength: 16, maxlength: 100 },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    answer: { type: mongoose.Schema.Types.Mixed, default: null }
  }],
  score: { type: Number, required: true, min: 0 },
  totalMarks: { type: Number, required: true, min: 1 },
  passingPercent: { type: Number, required: true, min: 1, max: 100 },
  passed: { type: Boolean, required: true },
  submittedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true, versionKey: false });

teacherAssessmentAttemptSchema.index({ student: 1, submissionKey: 1 }, { unique: true });
teacherAssessmentAttemptSchema.index({ student: 1, teacher: 1, ageGroup: 1, submittedAt: -1 });

module.exports = mongoose.models.TeacherAssessmentAttempt
  || mongoose.model('TeacherAssessmentAttempt', teacherAssessmentAttemptSchema);
