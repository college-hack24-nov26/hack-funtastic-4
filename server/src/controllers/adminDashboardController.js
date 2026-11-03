const adminDashboardService = require('../services/adminDashboardService');

async function getDashboard(request, response, next) {
  try {
    const result = await adminDashboardService.getDashboardSummary();
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDashboard };
