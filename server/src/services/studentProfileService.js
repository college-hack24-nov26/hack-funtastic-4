const User = require('../models/user');
const progressionRules = require('../config/progression');

const AGE_GROUPS = new Set(['6-8', '9-12', '13-15', '16-18', '18+']);
const LANGUAGES = new Set(['English', 'Hindi', 'Sanskrit']);
const INTERESTS = new Set(['stories', 'culture', 'history', 'puzzles', 'quizzes', 'art']);
const PROFILE_FIELDS = new Set([
  'displayName',
  'profilePictureUrl',
  'dateOfBirth',
  'ageGroup',
  'schoolName',
  'grade',
  'preferredLanguage',
  'learningInterests'
]);
const OPTIONAL_TEXT_LENGTHS = {
  schoolName: 100,
  grade: 40
};

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateObjectBody(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('A valid request body is required.', 400);
  }

  const keys = Object.keys(input);
  const unsupportedField = keys.find((key) => !PROFILE_FIELDS.has(key));

  if (unsupportedField) {
    throw createError(`The field "${unsupportedField}" cannot be updated.`, 400);
  }
}

function normalizeProfileInput(input, { requireOnboardingFields = false } = {}) {
  validateObjectBody(input);

  const update = {};

  if ('displayName' in input) {
    if (typeof input.displayName !== 'string') {
      throw createError('Display name must be text.', 400);
    }

    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 80) {
      throw createError('Display name must be between 2 and 80 characters.', 400);
    }
    update.displayName = displayName;
  }

  if ('profilePictureUrl' in input) {
    if (typeof input.profilePictureUrl !== 'string') {
      throw createError('Profile picture URL must be text.', 400);
    }
    const pictureUrl = input.profilePictureUrl.trim();
    if (pictureUrl.length > 500) {
      throw createError('Profile picture URL cannot exceed 500 characters.', 400);
    }
    if (pictureUrl) {
      let parsedUrl;
      try {
        parsedUrl = new URL(pictureUrl);
      } catch (error) {
        throw createError('Enter a valid profile picture URL.', 400);
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw createError('Profile picture URL must use HTTP or HTTPS.', 400);
      }
    }
    update.profilePictureUrl = pictureUrl;
  }

  if ('dateOfBirth' in input) {
    if (input.dateOfBirth === '' || input.dateOfBirth === null) {
      update.dateOfBirth = null;
    } else if (
      typeof input.dateOfBirth !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)
    ) {
      throw createError('Date of birth must be a valid date in YYYY-MM-DD format.', 400);
    } else {
      const date = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.dateOfBirth) {
        throw createError('Enter a valid date of birth.', 400);
      }
      if (date > new Date()) {
        throw createError('Date of birth cannot be in the future.', 400);
      }
      update.dateOfBirth = date;
    }
  }

  if ('ageGroup' in input) {
    if (typeof input.ageGroup !== 'string' || !AGE_GROUPS.has(input.ageGroup)) {
      throw createError('Choose a supported age group.', 400);
    }
    update.ageGroup = input.ageGroup;
  }

  for (const [field, maximumLength] of Object.entries(OPTIONAL_TEXT_LENGTHS)) {
    if (field in input) {
      if (typeof input[field] !== 'string' || input[field].trim().length > maximumLength) {
        throw createError(`${field === 'grade' ? 'Class or grade' : 'School name'} must be no more than ${maximumLength} characters.`, 400);
      }
      update[field] = input[field].trim();
    }
  }

  if ('preferredLanguage' in input) {
    if (typeof input.preferredLanguage !== 'string' || !LANGUAGES.has(input.preferredLanguage)) {
      throw createError('Choose a supported preferred language.', 400);
    }
    update.preferredLanguage = input.preferredLanguage;
  }

  if ('learningInterests' in input) {
    if (
      !Array.isArray(input.learningInterests)
      || input.learningInterests.length > INTERESTS.size
      || input.learningInterests.some((interest) => typeof interest !== 'string' || !INTERESTS.has(interest))
      || new Set(input.learningInterests).size !== input.learningInterests.length
    ) {
      throw createError('Choose only supported, non-duplicate learning interests.', 400);
    }
    update.learningInterests = input.learningInterests;
  }

  if (requireOnboardingFields) {
    for (const field of ['displayName', 'ageGroup', 'preferredLanguage']) {
      if (!(field in update)) {
        throw createError(`${field} is required to complete onboarding.`, 400);
      }
    }
  }

  if (Object.keys(update).length === 0) {
    throw createError('Provide at least one profile field to update.', 400);
  }

  return update;
}

function getProfileCompletion(user) {
  const requiredFields = ['displayName', 'ageGroup', 'preferredLanguage'];
  const completedFields = requiredFields.filter((field) => Boolean(user[field])).length;

  return {
    completed: user.onboardingCompleted,
    percentage: Math.round((completedFields / requiredFields.length) * 100),
    completedFields,
    totalFields: requiredFields.length
  };
}

function serializeProfile(user) {
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    profilePictureUrl: user.profilePictureUrl || '',
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    ageGroup: user.ageGroup || '',
    role: user.role,
    dharmaPoints: user.dharmaPoints || 0,
    adharmaPoints: user.adharmaPoints || 0,
    effectiveDharma: Math.max(0, (user.dharmaPoints || 0) - (user.adharmaPoints || 0) * progressionRules.lokaAdharmaMultiplier),
    schoolName: user.schoolName || '',
    grade: user.grade || '',
    preferredLanguage: user.preferredLanguage || '',
    learningInterests: user.learningInterests || [],
    onboardingCompleted: Boolean(user.onboardingCompleted),
    onboardingCompletedAt: user.onboardingCompletedAt || null,
    profileUpdatedAt: user.profileUpdatedAt || user.updatedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function safeProfileResponse(user) {
  return {
    user: serializeProfile(user),
    profileCompletion: getProfileCompletion(user)
  };
}

async function findUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw createError('Student profile not found.', 404);
  }
  return user;
}

async function getProfile(userId) {
  return safeProfileResponse(await findUser(userId));
}

async function updateProfile(userId, input) {
  const update = normalizeProfileInput(input);
  const user = await findUser(userId);

  for (const [field, value] of Object.entries(update)) {
    user.set(field, value);
  }

  user.profileUpdatedAt = new Date();
  const requiredFieldsPresent = Boolean(user.displayName && user.ageGroup && user.preferredLanguage);
  if (user.onboardingCompleted && !requiredFieldsPresent) {
    user.onboardingCompleted = false;
    user.onboardingCompletedAt = null;
  }

  await user.save();
  return safeProfileResponse(user);
}

async function getOnboardingStatus(userId) {
  const user = await findUser(userId);
  return {
    onboardingCompleted: Boolean(user.onboardingCompleted),
    onboardingRequired: !user.onboardingCompleted,
    profileCompletion: getProfileCompletion(user)
  };
}

async function completeOnboarding(userId, input) {
  const update = normalizeProfileInput(input, { requireOnboardingFields: true });
  const user = await findUser(userId);

  for (const [field, value] of Object.entries(update)) {
    user.set(field, value);
  }

  user.onboardingCompleted = true;
  user.onboardingCompletedAt = new Date();
  user.profileUpdatedAt = new Date();
  await user.save();

  return safeProfileResponse(user);
}

module.exports = {
  completeOnboarding,
  getOnboardingStatus,
  getProfile,
  normalizeProfileInput,
  safeProfileResponse,
  updateProfile
};
