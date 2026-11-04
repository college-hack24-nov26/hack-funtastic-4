const mongoose = require('mongoose');

const AGE_GROUPS = ['6-8', '9-12', '13-15', '16-18', '18+'];
const USER_ROLES = ['student', 'teacher', 'admin', 'guardian'];
const PREFERRED_LANGUAGES = ['English', 'Hindi', 'Sanskrit'];
const LEARNING_INTERESTS = ['stories', 'culture', 'history', 'puzzles', 'quizzes', 'art'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const PROFILE_PICTURE_PROTOCOLS = ['http:', 'https:'];

function isValidProfilePictureUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return PROFILE_PICTURE_PROTOCOLS.includes(url.protocol);
  } catch (error) {
    return false;
  }
}

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: [true, 'Display name is required.'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters long.'],
      maxlength: [80, 'Display name cannot exceed 80 characters.']
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      trim: true,
      lowercase: true,
      match: [EMAIL_PATTERN, 'Enter a valid email address.'],
      unique: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required.'],
      select: false,
      validate: {
        validator: (value) => BCRYPT_HASH_PATTERN.test(value),
        message: 'Password must be stored as a bcrypt hash.'
      }
    },
    ageGroup: {
      type: String,
      enum: {
        values: AGE_GROUPS,
        message: 'Age group must be one of: 6-8, 9-12, 13-15, 16-18, 18+.'
      },
      default: null
    },
    profilePictureUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Profile picture URL cannot exceed 500 characters.'],
      validate: {
        validator: isValidProfilePictureUrl,
        message: 'Profile picture URL must be a valid HTTP or HTTPS URL.'
      },
      default: ''
    },
    dateOfBirth: {
      type: Date,
      default: null,
      validate: {
        validator: (value) => !value || value <= new Date(),
        message: 'Date of birth cannot be in the future.'
      }
    },
    schoolName: {
      type: String,
      trim: true,
      maxlength: [100, 'School name cannot exceed 100 characters.'],
      default: ''
    },
    grade: {
      type: String,
      trim: true,
      maxlength: [40, 'Class or grade cannot exceed 40 characters.'],
      default: ''
    },
    preferredLanguage: {
      type: String,
      enum: {
        values: PREFERRED_LANGUAGES,
        message: 'Choose a supported preferred language.'
      },
      default: null
    },
    learningInterests: {
      type: [{
        type: String,
        enum: {
          values: LEARNING_INTERESTS,
          message: 'Choose supported learning interests.'
        }
      }],
      default: [],
      validate: {
        validator: (values) => values.length <= LEARNING_INTERESTS.length
          && new Set(values).size === values.length,
        message: 'Learning interests must be unique and supported.'
      }
    },
    onboardingCompleted: {
      type: Boolean,
      default: false
    },
    onboardingCompletedAt: {
      type: Date,
      default: null
    },
    profileUpdatedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: 'Role must be student, teacher, admin, or guardian.'
      },
      default: 'student'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    dharmaPoints: {
      type: Number,
      min: 0,
      default: 0
    },
    adharmaPoints: {
      type: Number,
      min: 0,
      default: 0
    },
    maxDharmaPoints: { type: Number, min: 0, default: 0 },
    unlockedLokaKeys: { type: [{ type: String, trim: true }], default: ['bhuloka'] },
    unlockedAshramStageKeys: { type: [{ type: String, trim: true }], default: ['forest-hermitage'] },
    pointEventKeys: {
      type: [{ type: String, trim: true, maxlength: 180 }],
      default: []
    },
    dailyDharmaRecords: {
      type: [{
        dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        dharmaEarned: { type: Number, required: true, min: 0, default: 0 }
      }],
      default: []
    },
    dharmaEarnedEvents: {
      type: [{
        eventKey: { type: String, required: true, maxlength: 180 },
        points: { type: Number, required: true, min: 1 },
        earnedAt: { type: Date, required: true, default: Date.now }
      }],
      default: []
    },
    dashboardSettings: {
      timeZone: { type: String, trim: true, maxlength: 100, default: 'UTC' },
      notifications: {
        learningReminders: { type: Boolean, default: true },
        assessmentNotifications: { type: Boolean, default: true },
        announcementNotifications: { type: Boolean, default: true },
        achievementNotifications: { type: Boolean, default: true }
      },
      appearance: {
        theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
        fontSize: { type: String, enum: ['standard', 'large'], default: 'standard' }
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);
