const service = require('../services/announcementService');

function handle(action, status = 200) {
  return async (request, response, next) => {
    try { return response.status(status).json(await action(request)); }
    catch (error) { return next(error); }
  };
}

module.exports = {
  list: handle((request) => service.listAdmin(request.query.status || 'all')),
  create: handle((request) => service.create(request.body, request.user.id), 201),
  update: handle((request) => service.update(request.params.id, request.body)),
  publication: handle((request) => service.setPublication(request.params.id, request.body?.publicationStatus))
};
