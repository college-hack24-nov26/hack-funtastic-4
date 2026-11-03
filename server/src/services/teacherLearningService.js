const mongoose = require('mongoose');
const Teacher = require('../models/teacher');
const TeacherProgress = require('../models/teacherProgress');
const TeacherAssessmentAttempt = require('../models/teacherAssessmentAttempt');
const User = require('../models/user');
const studentPointsService = require('./studentPointsService');
const progressionRules = require('../config/progression');

const AGE_GROUPS = Teacher.AGE_GROUPS;

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeAnswer(value) {
  if (typeof value === 'string') return value.trim().toLocaleLowerCase();
  if (Array.isArray(value)) return value.map(normalizeAnswer);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeAnswer(value[key])]));
  }
  return value;
}

function safeQuestion(question, { reveal = false } = {}) {
  const result = {
    id: question._id.toString(),
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    marks: question.marks
  };
  if (reveal) {
    result.correctAnswer = question.correctAnswer;
    result.acceptedAnswers = question.acceptedAnswers || [];
    result.explanation = question.explanation;
  }
  return result;
}

function safeAssessment(assessment) {
  if (!assessment) return null;
  return {
    id: assessment._id.toString(),
    title: assessment.title,
    instructions: assessment.instructions,
    passingPercent: assessment.passingPercent,
    timeLimitMinutes: assessment.timeLimitMinutes,
    questions: assessment.questions.map((question) => safeQuestion(question))
  };
}

function safeTeacher(teacher, { withProgress = null } = {}) {
  const value = teacher.toObject ? teacher.toObject() : structuredClone(teacher);
  for (const syllabus of value.ageGroups || []) {
    for (const module of syllabus.modules || []) {
      if (module.assessment) module.assessment = safeAssessment(module.assessment);
      for (const chapter of module.chapters || []) {
        if (chapter.assessment) chapter.assessment = safeAssessment(chapter.assessment);
      }
    }
  }
  if (withProgress) value.progress = withProgress;
  return value;
}

function safeAttempt(attempt, assessment) {
  const answerById = new Map((attempt.answers || []).map((entry) => [entry.questionId.toString(), entry.answer]));
  return {
    id: attempt._id.toString(),
    teacherId: attempt.teacher.toString(),
    ageGroup: attempt.ageGroup,
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: Math.round((attempt.score / attempt.totalMarks) * 100),
    passed: attempt.passed,
    submittedAt: attempt.submittedAt,
    feedback: assessment.questions.map((question) => {
      const submitted = answerById.get(question._id.toString()) ?? null;
      const correct = JSON.stringify(normalizeAnswer(submitted)) === JSON.stringify(normalizeAnswer(question.correctAnswer))
        || (question.type === 'fillBlank' && (question.acceptedAnswers || []).some((answer) =>
          JSON.stringify(normalizeAnswer(submitted)) === JSON.stringify(normalizeAnswer(answer))));
      return {
        questionId: question._id.toString(),
        submittedAnswer: submitted,
        correct,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation
      };
    })
  };
}

function validateAgeGroup(ageGroup) {
  if (!AGE_GROUPS.includes(ageGroup)) throw httpError('Choose a supported age group.', 400);
}

function validateTeacherSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw httpError('Teacher identifier must be a valid slug.', 400);
  }
}

async function findPublishedTeacher(slug) {
  validateTeacherSlug(slug);
  const teacher = await Teacher.findOne({ slug: slug.toLowerCase(), publicationStatus: 'published' });
  if (!teacher) throw httpError('Teacher not found.', 404);
  return teacher;
}

function findSyllabus(teacher, ageGroup) {
  validateAgeGroup(ageGroup);
  const syllabus = teacher.ageGroups.find((item) => item.ageGroup === ageGroup);
  if (!syllabus) throw httpError('Syllabus not found for this age group.', 404);
  return syllabus;
}

function findAssessment(teacher, ageGroup, assessmentId) {
  if (!mongoose.isObjectIdOrHexString(assessmentId)) throw httpError('Assessment identifier must be a valid ID.', 400);
  const syllabus = findSyllabus(teacher, ageGroup);
  for (const module of syllabus.modules) {
    if (module.assessment?._id.equals(assessmentId)) return { syllabus, assessment: module.assessment };
    for (const chapter of module.chapters) {
      if (chapter.assessment?._id.equals(assessmentId)) return { syllabus, assessment: chapter.assessment };
    }
  }
  throw httpError('Assessment not found.', 404);
}

function findLesson(teacher, ageGroup, lessonId) {
  if (!mongoose.isObjectIdOrHexString(lessonId)) throw httpError('Lesson identifier must be a valid ID.', 400);
  const syllabus = findSyllabus(teacher, ageGroup);
  for (const module of syllabus.modules) {
    for (const chapter of module.chapters) {
      const lessonIndex = chapter.lessons.findIndex((lesson) => lesson._id.equals(lessonId));
      if (lessonIndex !== -1) return { syllabus, module, chapter, lesson: chapter.lessons[lessonIndex], lessonIndex };
    }
  }
  throw httpError('Lesson not found.', 404);
}

async function getLesson(slug, ageGroup, lessonId, studentId) {
  const teacher = await findPublishedTeacher(slug);
  const { module, chapter, lesson, syllabus } = findLesson(teacher, ageGroup, lessonId);
  const progress = await TeacherProgress.findOne({ student: studentId, teacher: teacher._id, ageGroup });
  const allLessons = syllabus.modules.flatMap((item) => item.chapters.flatMap((part) => part.lessons.map((entry) => ({ module: item, chapter: part, lesson: entry }))));
  const index = allLessons.findIndex((item) => item.lesson._id.equals(lesson._id));
  const completed = (progress?.completedLessonIds || []).some((id) => id.equals(lesson._id));
  return {
    teacher: { id: teacher._id.toString(), name: teacher.name, slug: teacher.slug, title: teacher.title, teachingDomain: teacher.teachingDomain, portrait: teacher.portrait },
    ageGroup,
    module: { id: module._id.toString(), title: module.title, order: module.order },
    chapter: { id: chapter._id.toString(), title: chapter.title, order: chapter.order },
    lesson: { ...lesson.toObject(), completed },
    studyRequirementSeconds: progressionRules.lessonMinimumStudySeconds,
    navigation: {
      previous: index > 0 ? allLessons[index - 1].lesson._id.toString() : null,
      next: index + 1 < allLessons.length ? allLessons[index + 1].lesson._id.toString() : null,
      position: index + 1,
      total: allLessons.length
    },
    progress: progressSummary(teacher, ageGroup, progress)
  };
}

function progressSummary(teacher, ageGroup, progress, attemptCount = 0) {
  const syllabus = teacher.ageGroups.find((item) => item.ageGroup === ageGroup);
  if (!syllabus) return null;
  const lessonIds = syllabus.modules.flatMap((module) => module.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson._id.toString())));
  const lessonSet = new Set(lessonIds);
  const completed = new Set((progress?.completedLessonIds || []).map((id) => id.toString()).filter((id) => lessonSet.has(id)));
  const modules = syllabus.modules.map((module) => module._id.toString());
  const startedModules = new Set((progress?.startedModuleIds || []).map((id) => id.toString()).filter((id) => modules.includes(id)));
  const lastId = progress?.lastAccessedLessonId?.toString() || null;
  const lastIndex = lastId ? lessonIds.indexOf(lastId) : -1;
  const nextIncomplete = lessonIds.slice(Math.max(0, lastIndex + (lastIndex >= 0 && !completed.has(lastId) ? 0 : 1)))
    .find((id) => !completed.has(id)) || lessonIds.find((id) => !completed.has(id)) || null;
  return {
    teacherId: teacher._id.toString(),
    slug: teacher.slug,
    name: teacher.name,
    ageGroup,
    modules: syllabus.modules.length,
    modulesStarted: startedModules.size,
    chapters: syllabus.modules.reduce((sum, module) => sum + module.chapters.length, 0),
    totalLessons: lessonIds.length,
    completedLessons: completed.size,
    remainingLessons: lessonIds.length - completed.size,
    percentage: lessonIds.length ? Math.round((completed.size / lessonIds.length) * 100) : 0,
    testsAttempted: attemptCount,
    continueLessonId: nextIncomplete,
    lastAccessedLessonId: lastId,
    lastAccessedAt: progress?.lastAccessedAt || null,
    lastActivityAt: progress?.updatedAt || progress?.lastAccessedAt || null
  };
}

function assessmentEntries(teacher, ageGroup) {
  const syllabus = teacher.ageGroups.find((item) => item.ageGroup === ageGroup);
  if (!syllabus) return [];
  const entries = [];
  for (const module of syllabus.modules) {
    const assessments = [
      { assessment: module.assessment, chapter: null },
      ...module.chapters.map((chapter) => ({ assessment: chapter.assessment, chapter }))
    ];
    for (const { assessment, chapter } of assessments) {
      if (!assessment?.questions.length) continue;
      entries.push({
        id: assessment._id.toString(),
        title: assessment.title,
        instructions: assessment.instructions,
        teacher: { id: teacher._id.toString(), name: teacher.name, slug: teacher.slug },
        ageGroup,
        module: { id: module._id.toString(), title: module.title },
        chapter: chapter ? { id: chapter._id.toString(), title: chapter.title } : null,
        questionCount: assessment.questions.length,
        totalMarks: assessment.questions.reduce((total, question) => total + question.marks, 0),
        passingPercent: assessment.passingPercent,
        timeLimitMinutes: assessment.timeLimitMinutes,
        href: `/teacher-assessment.html?${new URLSearchParams({
          teacher: teacher.slug, ageGroup, assessment: assessment._id.toString()
        })}`
      });
    }
  }
  return entries;
}

async function listAssessments(studentId, ageGroup, status = 'all') {
  if (!['all', 'pending', 'submitted'].includes(status)) throw httpError('Assignment status is invalid.', 400);
  const student = await User.findById(studentId).select('ageGroup').lean();
  const selectedAgeGroup = ageGroup || student?.ageGroup;
  if (!selectedAgeGroup) return { assignments: [], ageGroup: null };
  validateAgeGroup(selectedAgeGroup);
  const [teachers, attempts] = await Promise.all([
    Teacher.find({ publicationStatus: 'published', 'ageGroups.ageGroup': selectedAgeGroup }).lean(),
    TeacherAssessmentAttempt.find({ student: studentId, ageGroup: selectedAgeGroup }).select('assessmentId').lean()
  ]);
  const submittedIds = new Set(attempts.map((attempt) => attempt.assessmentId.toString()));
  const assignments = teachers.flatMap((teacher) => assessmentEntries(teacher, selectedAgeGroup))
    .map((assignment) => ({ ...assignment, status: submittedIds.has(assignment.id) ? 'submitted' : 'pending' }))
    .filter((assignment) => status === 'all' || assignment.status === status);
  return { assignments, ageGroup: selectedAgeGroup };
}

async function listStudentAttempts(studentId) {
  const attempts = await TeacherAssessmentAttempt.find({ student: studentId })
    .select('teacher ageGroup assessmentId score totalMarks passingPercent passed submittedAt')
    .sort({ submittedAt: -1, _id: -1 })
    .limit(100)
    .lean();
  if (!attempts.length) return { submissions: [] };
  const teachers = await Teacher.find({ _id: { $in: [...new Set(attempts.map((attempt) => attempt.teacher.toString()))] } })
    .select('name slug ageGroups')
    .lean();
  const teacherById = new Map(teachers.map((teacher) => [teacher._id.toString(), teacher]));
  const submissions = attempts.map((attempt) => {
    const teacher = teacherById.get(attempt.teacher.toString());
    const assessment = teacher?.ageGroups.find((syllabus) => syllabus.ageGroup === attempt.ageGroup)?.modules
      .flatMap((module) => [module.assessment, ...module.chapters.map((chapter) => chapter.assessment)])
      .find((item) => item?._id.equals(attempt.assessmentId));
    const percentage = Math.round((attempt.score / attempt.totalMarks) * 100);
    return {
      id: attempt._id.toString(),
      assessmentId: attempt.assessmentId.toString(),
      title: assessment?.title || 'Assessment',
      teacher: teacher ? { name: teacher.name, slug: teacher.slug } : null,
      ageGroup: attempt.ageGroup,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
      status: 'graded',
      href: `/teacher-assessment.html?result=${encodeURIComponent(attempt._id.toString())}`
    };
  });
  return { submissions };
}

async function listTeachers(studentId, ageGroup) {
  if (ageGroup) validateAgeGroup(ageGroup);
  const teachers = await Teacher.find({ publicationStatus: 'published' }).sort({ name: 1 }).lean();
  const progress = await TeacherProgress.find({ student: studentId, ...(ageGroup ? { ageGroup } : {}) }).lean();
  const progressByTeacher = new Map(progress.map((entry) => [`${entry.teacher}:${entry.ageGroup}`, entry]));
  const attempts = await TeacherAssessmentAttempt.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId), ...(ageGroup ? { ageGroup } : {}) } },
    { $group: { _id: { teacher: '$teacher', ageGroup: '$ageGroup' }, count: { $sum: 1 } } }
  ]);
  const attemptCounts = new Map(attempts.map((entry) => [`${entry._id.teacher}:${entry._id.ageGroup}`, entry.count]));
  return {
    teachers: teachers.map((teacher) => {
      const paths = ageGroup ? [ageGroup] : AGE_GROUPS;
      const summaries = paths.map((group) => {
        const record = progressByTeacher.get(`${teacher._id}:${group}`);
        return progressSummary(teacher, group, record, attemptCounts.get(`${teacher._id}:${group}`) || 0);
      }).filter(Boolean);
      return {
        id: teacher._id.toString(), name: teacher.name, slug: teacher.slug, title: teacher.title,
        identityType: teacher.identityType, shortIntroduction: teacher.shortIntroduction,
        teachingDomain: teacher.teachingDomain, portrait: teacher.portrait,
        progress: ageGroup ? summaries[0] : summaries
      };
    })
  };
}

async function getTeacher(slug, studentId, ageGroup) {
  const teacher = await findPublishedTeacher(slug);
  let summary = null;
  if (ageGroup) {
    validateAgeGroup(ageGroup);
    const progress = await TeacherProgress.findOne({ student: studentId, teacher: teacher._id, ageGroup });
    const attemptCount = await TeacherAssessmentAttempt.countDocuments({ student: studentId, teacher: teacher._id, ageGroup });
    summary = progressSummary(teacher, ageGroup, progress, attemptCount);
  }
  const profile = teacher.toObject();
  delete profile.ageGroups;
  return { teacher: profile, progress: summary };
}

async function getSyllabus(slug, ageGroup, studentId) {
  const teacher = await findPublishedTeacher(slug);
  const syllabus = findSyllabus(teacher, ageGroup);
  const progress = await TeacherProgress.findOne({ student: studentId, teacher: teacher._id, ageGroup });
  const safe = safeTeacher({ toObject: () => ({ ...teacher.toObject(), ageGroups: [syllabus.toObject()] }) }).ageGroups[0];
  const completed = new Set((progress?.completedLessonIds || []).map((id) => id.toString()));
  for (const module of safe.modules) {
    for (const chapter of module.chapters) {
      chapter.lessons = chapter.lessons.map((lesson) => ({ ...lesson, completed: completed.has(lesson._id.toString()) }));
    }
  }
  return { syllabus: safe, progress: progressSummary(teacher, ageGroup, progress) };
}

async function recordLessonAccess(slug, ageGroup, lessonId, studentId) {
  const teacher = await findPublishedTeacher(slug);
  const { module, chapter, lesson } = findLesson(teacher, ageGroup, lessonId);
  const now = new Date();
  const progress = await TeacherProgress.findOneAndUpdate(
    { student: studentId, teacher: teacher._id, ageGroup },
    { $addToSet: { startedModuleIds: module._id }, $set: { lastAccessedLessonId: lesson._id, lastAccessedModuleId: module._id, lastAccessedChapterId: chapter._id, lastAccessedAt: now }, $setOnInsert: { student: studentId, teacher: teacher._id, ageGroup } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { progress: progressSummary(teacher, ageGroup, progress) };
}

async function completeLesson(slug, ageGroup, lessonId, studentId) {
  const teacher = await findPublishedTeacher(slug);
  const { module, chapter, lesson } = findLesson(teacher, ageGroup, lessonId);
  const now = new Date();
  const priorAccess = await TeacherProgress.findOne({
    student: studentId, teacher: teacher._id, ageGroup, lastAccessedLessonId: lesson._id
  }).select('lastAccessedAt completedLessonIds').lean();
  const alreadyCompleted = (priorAccess?.completedLessonIds || []).some((id) => id.toString() === lesson._id.toString());
  const studyTimeMs = priorAccess?.lastAccessedAt ? now.getTime() - new Date(priorAccess.lastAccessedAt).getTime() : 0;
  if (!alreadyCompleted && studyTimeMs < progressionRules.lessonMinimumStudySeconds * 1000) {
    throw httpError(`Keep this lesson open for at least ${progressionRules.lessonMinimumStudySeconds} seconds before completing it.`, 400);
  }
  const progress = await TeacherProgress.findOneAndUpdate(
    { student: studentId, teacher: teacher._id, ageGroup },
    {
      $addToSet: { startedModuleIds: module._id, completedLessonIds: lesson._id },
      $set: { lastAccessedLessonId: lesson._id, lastAccessedModuleId: module._id, lastAccessedChapterId: chapter._id, lastAccessedAt: now },
      $setOnInsert: { student: studentId, teacher: teacher._id, ageGroup }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  let dharmaPointsAwarded = 0;
  if (!alreadyCompleted && studyTimeMs >= progressionRules.lessonMinimumStudySeconds * 1000
    && progress.completedLessonIds.some((id) => id.equals(lesson._id))) {
    const reward = await studentPointsService.applyChoice(studentId, {
      eventKey: `teacher-lesson:${teacher._id}:${ageGroup}:${lesson._id}:dharma`, dharmaChange: progressionRules.lessonCompletionDharma
    });
    if (reward.applied) dharmaPointsAwarded = progressionRules.lessonCompletionDharma;
  }
  return { progress: progressSummary(teacher, ageGroup, progress), dharmaPointsAwarded };
}

function validateSubmittedAnswer(question, answer) {
  if (question.type === 'multipleChoice') {
    if (typeof answer !== 'string' || !question.options.some((option) => option.key === answer)) throw httpError('A submitted answer is invalid.', 400);
    return answer;
  }
  if (question.type === 'trueFalse') {
    if (typeof answer !== 'boolean') throw httpError('A submitted answer is invalid.', 400);
    return answer;
  }
  if (question.type === 'fillBlank' || question.type === 'shortAnswer') {
    if (typeof answer !== 'string' || answer.length > 500) throw httpError('A submitted answer is invalid.', 400);
    return answer.trim();
  }
  if (question.type === 'matching') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || Object.keys(answer).length > 20) throw httpError('A submitted answer is invalid.', 400);
    return answer;
  }
  throw httpError('This question type is not supported.', 400);
}

function answerIsCorrect(question, answer) {
  const normalized = normalizeAnswer(answer);
  if (JSON.stringify(normalized) === JSON.stringify(normalizeAnswer(question.correctAnswer))) return true;
  return ['fillBlank', 'shortAnswer'].includes(question.type)
    && (question.acceptedAnswers || []).some((candidate) => JSON.stringify(normalized) === JSON.stringify(normalizeAnswer(candidate)));
}

async function submitAssessment(slug, ageGroup, assessmentId, input, studentId) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.submissionKey !== 'string' || input.submissionKey.length < 16 || input.submissionKey.length > 100 || !Array.isArray(input.answers)) {
    throw httpError('A valid assessment submission is required.', 400);
  }
  const teacher = await findPublishedTeacher(slug);
  const { syllabus, assessment } = findAssessment(teacher, ageGroup, assessmentId);
  const existing = await TeacherAssessmentAttempt.findOne({ student: studentId, submissionKey: input.submissionKey });
  if (existing) {
    if (!existing.teacher.equals(teacher._id) || !existing.assessmentId.equals(assessment._id) || existing.ageGroup !== ageGroup) throw httpError('Submission key has already been used.', 409);
    return { result: await withDharmaReward(safeAttempt(existing, assessment), assessment, studentId, existing._id) };
  }
  const questions = new Map(assessment.questions.map((question) => [question._id.toString(), question]));
  const seen = new Set();
  const answers = input.answers.map((entry) => {
    if (!entry || typeof entry !== 'object' || !mongoose.isObjectIdOrHexString(entry.questionId)) throw httpError('A submitted answer is invalid.', 400);
    const id = entry.questionId.toString();
    const question = questions.get(id);
    if (!question || seen.has(id)) throw httpError('A submitted answer is invalid.', 400);
    seen.add(id);
    return { questionId: question._id, answer: validateSubmittedAnswer(question, entry.answer) };
  });
  if (answers.length !== questions.size) throw httpError('Answer every assessment question before submitting.', 400);
  let totalMarks = 0;
  let score = 0;
  for (const { questionId, answer } of answers) {
    const question = questions.get(questionId.toString());
    totalMarks += question.marks;
    if (answerIsCorrect(question, answer)) score += question.marks;
  }
  const percentage = Math.round((score / totalMarks) * 100);
  let attempt;
  try {
    attempt = await TeacherAssessmentAttempt.create({
      student: studentId, teacher: teacher._id, ageGroup, assessmentId: assessment._id,
      submissionKey: input.submissionKey, answers, score, totalMarks,
      passingPercent: assessment.passingPercent, passed: percentage >= assessment.passingPercent
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    attempt = await TeacherAssessmentAttempt.findOne({ student: studentId, submissionKey: input.submissionKey });
  }
  return { result: await withDharmaReward(safeAttempt(attempt, assessment), assessment, studentId, attempt._id), syllabusId: syllabus._id.toString() };
}

async function withDharmaReward(result, assessment, studentId, attemptId) {
  const points = result.score * progressionRules.assessmentDharmaPerCorrectMark;
  if (points > 0) {
    const awarded = await studentPointsService.applyChoice(studentId, {
      eventKey: `teacher-assessment:${attemptId}:dharma`, dharmaChange: points
    });
    result.dharmaPointsAwarded = awarded.pointsApplied;
  } else {
    result.dharmaPointsAwarded = 0;
  }
  return result;
}

async function getAssessmentResult(attemptId, studentId) {
  if (!mongoose.isObjectIdOrHexString(attemptId)) throw httpError('Result identifier must be a valid ID.', 400);
  const attempt = await TeacherAssessmentAttempt.findOne({ _id: attemptId, student: studentId });
  if (!attempt) throw httpError('Assessment result not found.', 404);
  const teacher = await Teacher.findById(attempt.teacher);
  if (!teacher) throw httpError('Assessment result not found.', 404);
  let assessment = null;
  for (const syllabus of teacher.ageGroups) {
    if (syllabus.ageGroup !== attempt.ageGroup) continue;
    for (const module of syllabus.modules) {
      if (module.assessment?._id.equals(attempt.assessmentId)) assessment = module.assessment;
      for (const chapter of module.chapters) if (chapter.assessment?._id.equals(attempt.assessmentId)) assessment = chapter.assessment;
    }
  }
  if (!assessment) throw httpError('Assessment result not found.', 404);
  return { result: safeAttempt(attempt, assessment) };
}

async function getStudentProgress(studentId) {
  const [teachers, records, attempts] = await Promise.all([
    Teacher.find({ publicationStatus: 'published' }).lean(),
    TeacherProgress.find({ student: studentId }).lean(),
    TeacherAssessmentAttempt.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId) } },
      { $group: { _id: { teacher: '$teacher', ageGroup: '$ageGroup' }, count: { $sum: 1 } } }
    ])
  ]);
  const attemptCounts = new Map(attempts.map((item) => [`${item._id.teacher}:${item._id.ageGroup}`, item.count]));
  return {
    teachers: teachers.flatMap((teacher) => teacher.ageGroups.map((syllabus) => {
      const progress = records.find((item) => item.teacher.toString() === teacher._id.toString() && item.ageGroup === syllabus.ageGroup);
      return progressSummary(teacher, syllabus.ageGroup, progress, attemptCounts.get(`${teacher._id}:${syllabus.ageGroup}`) || 0);
    }))
  };
}

module.exports = {
  completeLesson,
  getAssessmentResult,
  getLesson,
  listAssessments,
  listStudentAttempts,
  getStudentProgress,
  getSyllabus,
  getTeacher,
  listTeachers,
  recordLessonAccess,
  submitAssessment
};
