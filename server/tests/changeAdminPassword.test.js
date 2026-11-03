const assert = require('node:assert/strict');
const test = require('node:test');
const { runPasswordChange, validateInput } = require('../scripts/changeAdminPassword');

const validDetails = {
  email: 'test-admin@example.invalid',
  password: 'temporary-new-password'
};

test('password-change CLI accepts valid input and keeps password out of output', async () => {
  const output = [];
  let received;
  let disconnected = false;
  await runPasswordChange({
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
  assert.match(output[0], /password updated/);
});

test('password-change CLI rejects invalid password lengths before connecting', async () => {
  assert.doesNotThrow(() => validateInput(validDetails));
  assert.throws(() => validateInput({ ...validDetails, password: 'short' }), /at least 12 characters/);
  assert.throws(() => validateInput({ ...validDetails, password: '😀'.repeat(19) }), /72 UTF-8 bytes/);

  let connected = false;
  await assert.rejects(runPasswordChange({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails, password: 'short' }),
    connect: async () => { connected = true; },
    changePassword: async () => assert.fail('must not change a password after validation fails'),
    disconnect: async () => {},
    output: { log() {} }
  }), /at least 12 characters/);
  assert.equal(connected, false);
});

test('password-change CLI reports database failure without logging a password and disconnects', async () => {
  const lines = [];
  let disconnected = false;
  await assert.rejects(runPasswordChange({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails }),
    connect: async () => {},
    changePassword: async () => { throw new Error('private database detail'); },
    disconnect: async () => { disconnected = true; },
    output: { log: (message) => lines.push(message) }
  }), /private database detail/);
  assert.equal(disconnected, true);
  assert.equal(lines.join('\n').includes(validDetails.password), false);
});

test('password-change CLI refuses to prompt or connect when MONGODB_URI is missing', async () => {
  let prompted = false;
  await assert.rejects(runPasswordChange({
    mongoUri: '',
    prompt: async () => { prompted = true; return validDetails; },
    connect: async () => assert.fail('must not connect without MONGODB_URI'),
    changePassword: async () => assert.fail('must not update without MONGODB_URI'),
    disconnect: async () => {},
    output: { log() {} }
  }), /MONGODB_URI is missing/);
  assert.equal(prompted, false);
});
