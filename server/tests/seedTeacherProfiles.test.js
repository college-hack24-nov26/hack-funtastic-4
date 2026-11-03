require('dotenv').config();

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const mongoose = require('mongoose');
const Teacher = require('../src/models/teacher');
const seedTeacherProfiles = require('../scripts/seedTeacherProfiles');

const databaseName = `mythoverse_teacher_seed_test_${randomBytes(10).toString('hex')}`;

test('teacher profile seed adds six drafts once and preserves existing edits', async () => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI is required for the isolated teacher seed test.');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  assert.equal(mongoose.connection.name, databaseName);
  try {
    await Teacher.init();
    const first = await seedTeacherProfiles({ mongoUri: 'isolated-test-connection', connect: async () => {}, disconnect: async () => {}, output: { log() {} } });
    assert.equal(first.inserted.length, 6);
    assert.equal(first.existing.length, 0);
    assert.equal(await Teacher.countDocuments({}), 6);
    assert.equal(await Teacher.countDocuments({ publicationStatus: 'published' }), 0);
    const dharma = await Teacher.findOne({ slug: 'dharma' });
    dharma.shortIntroduction = 'Locally reviewed edit preserved by seed.';
    await dharma.save();
    const second = await seedTeacherProfiles({ mongoUri: 'isolated-test-connection', connect: async () => {}, disconnect: async () => {}, output: { log() {} } });
    assert.equal(second.inserted.length, 0);
    assert.equal(second.existing.length, 6);
    assert.equal((await Teacher.findOne({ slug: 'dharma' })).shortIntroduction, 'Locally reviewed edit preserved by seed.');
  } finally {
    if (mongoose.connection.readyState === 1) {
      if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
