const User = require('../models/user');

async function getAccountCount(role) {
  const database = User.db.db;
  if (!database) {
    throw new Error('Database connection is unavailable.');
  }

  const collectionExists = await database
    .listCollections({ name: User.collection.collectionName }, { nameOnly: true })
    .hasNext();

  if (!collectionExists) {
    return null;
  }

  return User.countDocuments({ role });
}

async function getDashboardSummary() {
  const [totalStudents, totalTeachers] = await Promise.all([
    getAccountCount('student'),
    getAccountCount('teacher')
  ]);

  return {
    summary: {
      totalStudents: {
        count: totalStudents,
        available: totalStudents !== null
      },
      totalTeachers: {
        count: totalTeachers,
        available: totalTeachers !== null
      },
      totalContentItems: {
        count: null,
        available: false
      },
      totalLearningActivities: {
        count: null,
        available: false
      }
    }
  };
}

module.exports = { getDashboardSummary };
