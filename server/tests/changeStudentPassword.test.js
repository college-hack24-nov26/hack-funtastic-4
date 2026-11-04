const assert = require('node:assert/strict');
const test = require('node:test');
const { runStudentPasswordChange, validateInput } = require('../scripts/changeStudentPassword');

const validDetails = {
  email: 'test-student@example.invalid',
  password: 'temporary-student-password'
};

test('student password CLI accepts valid details and does not print the password', async () => {
  const output = [];
  let received;
  let disconnected = false;
  await runStudentPasswordChange({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails }),
    connect: async () => {},
    changePassword: async (details) => { received = { ...details }; },
    disconnect: async () => { disconnected = true; },
    output: { log: (message) => output.push(message) }
  });
  assert.deepEqual(received, validDetails);
  assert.equal(disconnected, true);
  assert.equal(output.join('\n').includes(validDetails.password), false);
  assert.match(output[0], /Student password updated/);
});

test('student password CLI rejects invalid passwords before connecting', async () => {
  assert.doesNotThrow(() => validateInput(validDetails));
  assert.throws(() => validateInput({ ...validDetails, password: 'short' }), /at least 12 characters/);
  assert.throws(() => validateInput({ ...validDetails, password: '😀'.repeat(19) }), /72 UTF-8 bytes/);

  let connected = false;
  await assert.rejects(runStudentPasswordChange({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails, password: 'short' }),
    connect: async () => { connected = true; },
    changePassword: async () => assert.fail('must not update after password validation fails'),
    disconnect: async () => {},
    output: { log() {} }
  }), /at least 12 characters/);
  assert.equal(connected, false);
});

test('student password CLI disconnects safely when the database connection fails', async () => {
  let disconnected = false;
  await assert.rejects(runStudentPasswordChange({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails }),
    connect: async () => { throw new Error('fixture database connection failure'); },
    changePassword: async () => assert.fail('must not update when database connection fails'),
    disconnect: async () => { disconnected = true; },
    output: { log() {} }
  }), /fixture database connection failure/);
  assert.equal(disconnected, true);
});
