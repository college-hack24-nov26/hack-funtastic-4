const service = require('../services/guardianService');

function handle(action, status = 200) {
  return async (request, response, next) => {
    try { return response.status(status).json(await action(request)); }
    catch (error) { return next(error); }
  };
}

module.exports = {
  invite: handle((request) => service.createInvite(request.user.id, request.body), 201),
  studentRelationships: handle((request) => service.listStudentRelationships(request.user.id)),
  decide: handle((request) => service.setStudentApproval(request.user.id, request.params.relationshipId, request.body?.decision)),
  revoke: handle((request) => service.revokeStudentApproval(request.user.id, request.params.relationshipId)),
  acceptNew: handle((request) => service.acceptInviteForNewGuardian(request.body), 201),
  acceptExisting: handle((request) => service.acceptInviteForExistingGuardian(request.user.id, request.body)),
  guardianRelationships: handle((request) => service.listGuardianRelationships(request.user.id)),
  studentDashboard: handle((request) => service.getApprovedStudentDashboard(request.user.id, request.params.studentId, request.query.timeZone))
};
