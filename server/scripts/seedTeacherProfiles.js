require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const Teacher = require('../src/models/teacher');
const teacherProfiles = require('../src/data/teacherProfiles');

async function seedTeacherProfiles({
  mongoUri = process.env.MONGODB_URI,
  connect = connectDatabase,
  disconnect = () => mongoose.disconnect(),
  output = console
} = {}) {
  if (!mongoUri) throw new Error('MONGODB_URI is missing. Set it in the local .env file first.');
  let connectionAttempted = false;
  try {
    connectionAttempted = true;
    await connect(mongoUri);
    const inserted = [];
    const existing = [];
    for (const profile of teacherProfiles) {
      const alreadyThere = await Teacher.exists({ slug: profile.slug });
      if (alreadyThere) {
        existing.push(profile.slug);
        continue;
      }
      await Teacher.create(profile);
      inserted.push(profile.slug);
    }
    output.log(`Teacher profile setup complete: ${inserted.length} added, ${existing.length} already present. All seeded profiles remain drafts.`);
    return { inserted, existing };
  } finally {
    if (connectionAttempted) await disconnect();
  }
}

if (require.main === module) {
  seedTeacherProfiles().catch((error) => {
    console.error(error.statusCode === 400 ? error.message : 'Teacher profile setup failed. Check database connectivity and local configuration.');
    process.exitCode = 1;
  });
}

module.exports = seedTeacherProfiles;
