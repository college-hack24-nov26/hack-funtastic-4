const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const requireStudent = require('../middleware/requireStudent');
const controller = require('../controllers/studentDashboardController');
const guardianController = require('../controllers/guardianController');
const requireSameOrigin = require('../middleware/requireSameOrigin');
const settingsController = require('../controllers/studentSettingsController');
const learningContentValidation = require('../middleware/validateLearningContent');

const router = express.Router();
const guardianInviteLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const passwordChangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.use(authenticate, requireStudent);
router.get('/dashboard', controller.getDashboard);
router.get('/courses', controller.getCourses);
router.get('/courses/:slug', controller.getCourse);
router.get('/courses/:slug/age-groups/:ageGroup/syllabus', controller.getCourseSyllabus);
router.get('/courses/:slug/syllabus', controller.getCourseMaterials);
router.get('/courses/:slug/materials', controller.getCourseMaterials);
router.get('/assignments', controller.getAssignments);
router.get('/submissions', controller.getSubmissions);
router.get('/grades/gradebook', controller.getGradebook);
router.get('/grades/progress', controller.getStudentProgress);
router.get('/calendar/:kind', (request, response, next) => {
  if (!['classes', 'events', 'exams'].includes(request.params.kind)) {
    return response.status(404).json({ error: 'Calendar view not found.' });
  }
  return controller.getCalendar(request, response, next);
});
router.get('/library/resources', learningContentValidation.validateStoryQuery, controller.getLibraryResources);
router.get('/library/resources/:resourceId', controller.getLibraryResource);
router.get('/library/downloads', controller.getDownloads);
router.get('/announcements', controller.getAnnouncements);
router.get('/announcements/:announcementId', controller.getAnnouncement);
router.get('/settings', settingsController.getSettings);
router.put('/settings/preferences', requireSameOrigin, settingsController.updatePreferences);
router.put('/settings/notifications', requireSameOrigin, settingsController.updateNotifications);
router.put('/settings/password', passwordChangeLimiter, requireSameOrigin, settingsController.changePassword);
router.post('/guardian-invites', guardianInviteLimiter, requireSameOrigin, guardianController.invite);
router.get('/guardian-relationships', guardianController.studentRelationships);
router.patch('/guardian-relationships/:relationshipId', requireSameOrigin, guardianController.decide);
router.delete('/guardian-relationships/:relationshipId', requireSameOrigin, guardianController.revoke);

module.exports = router;
