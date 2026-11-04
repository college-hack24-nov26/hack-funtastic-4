const dashboardService = require('../services/studentDashboardService');
const announcementService = require('../services/announcementService');
const teacherLearningService = require('../services/teacherLearningService');
const learningContentService = require('../services/learningContentService');

function respond(action) {
  return async (request, response, next) => {
    try { return response.status(200).json(await action(request)); }
    catch (error) { return next(error); }
  };
}

async function getDashboard(request, response, next) {
  try {
    return response.status(200).json(await dashboardService.getDashboard(request.user.id, request.query.timeZone));
  } catch (error) { return next(error); }
}

async function getAnnouncements(request, response, next) {
  try { return response.status(200).json(await announcementService.listPublished()); }
  catch (error) { return next(error); }
}

module.exports = {
  getAnnouncement: respond((request) => announcementService.getPublished(request.params.announcementId)),
  getAnnouncements,
  getAssignments: respond((request) => teacherLearningService.listAssessments(
    request.user.id, request.query.ageGroup, request.query.status || 'all'
  )),
  getCalendar: respond(async (request) => ({
    available: false,
    items: [],
    reason: 'MythoVerse does not currently have scheduled classes, events, or assessment due dates.'
  })),
  getCourses: respond((request) => teacherLearningService.listTeachers(request.user.id, request.query.ageGroup)),
  getCourse: respond((request) => teacherLearningService.getTeacher(
    request.params.slug, request.user.id, request.query.ageGroup
  )),
  getCourseSyllabus: respond((request) => teacherLearningService.getSyllabus(
    request.params.slug, request.params.ageGroup, request.user.id
  )),
  getCourseMaterials: respond((request) => teacherLearningService.getSyllabus(
    request.params.slug, request.query.ageGroup, request.user.id
  )),
  getLibraryResource: respond((request) => learningContentService.getPublishedStory(request.params.resourceId)),
  getDownloads: respond(async () => ({
    available: false,
    downloads: [],
    reason: 'Download history is not currently recorded by MythoVerse.'
  })),
  getDashboard,
  getGradebook: respond((request) => teacherLearningService.listStudentAttempts(request.user.id)),
  getLibraryResources: respond((request) => learningContentService.listPublishedStories(request.query)),
  getStudentProgress: respond((request) => teacherLearningService.getStudentProgress(request.user.id)),
  getSubmissions: respond((request) => teacherLearningService.listStudentAttempts(request.user.id))
};
