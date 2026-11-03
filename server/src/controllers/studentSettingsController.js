const studentSettingsService = require('../services/studentSettingsService');
const { AUTH_COOKIE_NAME, getAuthCookieOptions } = require('../config/auth');

function respond(action) {
  return async (request, response, next) => {
    try { return response.status(200).json(await action(request)); }
    catch (error) { return next(error); }
  };
}

module.exports = {
  changePassword: async (request, response, next) => {
    try {
      const result = await studentSettingsService.changePassword(request.user.id, request.body);
      response.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
      return response.status(200).json(result);
    } catch (error) { return next(error); }
  },
  getSettings: respond((request) => studentSettingsService.getSettings(request.user.id)),
  updateNotifications: respond((request) => studentSettingsService.updateNotifications(request.user.id, request.body)),
  updatePreferences: respond((request) => studentSettingsService.updatePreferences(request.user.id, request.body))
};
