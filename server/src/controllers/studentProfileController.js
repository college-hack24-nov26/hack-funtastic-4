const studentProfileService = require('../services/studentProfileService');

async function getProfile(request, response, next) {
  try {
    const result = await studentProfileService.getProfile(request.user.id);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(request, response, next) {
  try {
    const result = await studentProfileService.updateProfile(request.user.id, request.body);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getOnboardingStatus(request, response, next) {
  try {
    const result = await studentProfileService.getOnboardingStatus(request.user.id);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function completeOnboarding(request, response, next) {
  try {
    const result = await studentProfileService.completeOnboarding(request.user.id, request.body);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  completeOnboarding,
  getOnboardingStatus,
  getProfile,
  updateProfile
};
