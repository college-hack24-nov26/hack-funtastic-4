const service = require('../services/teacherAdminService');

function respond(action, status = 200) {
  return async (request, response, next) => {
    try { return response.status(status).json(await action(request)); } catch (error) { return next(error); }
  };
}

module.exports = {
  list: respond((request) => service.listTeachers(request.query)),
  get: respond((request) => service.getTeacher(request.params.slug)),
  create: respond((request) => service.createTeacher(request.body), 201),
  update: respond((request) => service.updateTeacher(request.params.slug, request.body)),
  publication: respond((request) => service.setPublication(request.params.slug, request.body.publicationStatus))
};
