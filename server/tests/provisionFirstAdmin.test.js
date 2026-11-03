const assert = require('node:assert/strict');
const test = require('node:test');
const { runProvision, validateAdminInput } = require('../scripts/provisionFirstAdmin');

const validDetails = {
  displayName: 'Test Administrator',
  email: 'test-admin@example.invalid',
  password: 'temporary-test-password'
};

test('first-admin CLI validates complete input before connecting', () => {
  assert.doesNotThrow(() => validateAdminInput(validDetails));
  assert.throws(() => validateAdminInput({ ...validDetails, password: 'short' }), /at least 12 characters/);
  assert.throws(() => validateAdminInput({ ...validDetails, password: '😀'.repeat(19) }), /72 UTF-8 bytes/);
});

test('first-admin CLI runs provisioning and disconnects without printing credentials', async () => {
  const lines = [];
  let receivedDetails;
  let connectedWith;
  let disconnected = false;
  await runProvision({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails }),
    connect: async (uri) => { connectedWith = uri; },
    provision: async (details) => { receivedDetails = { ...details }; },
    disconnect: async () => { disconnected = true; },
    output: { log: (message) => lines.push(message) }
  });
  assert.equal(connectedWith, 'mongodb://test.invalid/test-db');
  assert.equal(receivedDetails.password, validDetails.password);
  assert.equal(disconnected, true);
  assert.equal(lines.join('\n').includes(validDetails.password), false);
  assert.match(lines[0], /account was created/);
});

test('first-admin CLI propagates existing-admin and existing-email refusals without account creation', async () => {
  for (const message of ['An administrator account already exists.', 'An account already uses this email.']) {
    let disconnected = false;
    let provisionAttempted = false;
    await assert.rejects(runProvision({
      mongoUri: 'mongodb://test.invalid/test-db',
      prompt: async () => ({ ...validDetails }),
      connect: async () => {},
      provision: async () => {
        provisionAttempted = true;
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
      disconnect: async () => { disconnected = true; },
      output: { log() {} }
    }), { statusCode: 409, message });
    assert.equal(provisionAttempted, true);
    assert.equal(disconnected, true);
  }
});

test('first-admin CLI disconnects after a database connection failure', async () => {
  let disconnected = false;
  await assert.rejects(runProvision({
    mongoUri: 'mongodb://test.invalid/test-db',
    prompt: async () => ({ ...validDetails }),
    connect: async () => { throw new Error('private connection detail'); },
    provision: async () => assert.fail('provisioning must not run when connect fails'),
    disconnect: async () => { disconnected = true; },
    output: { log() {} }
  }), /private connection detail/);
  assert.equal(disconnected, true);
});

test('first-admin CLI requires MONGODB_URI before prompting', async () => {
  let prompted = false;
  await assert.rejects(runProvision({
    mongoUri: '',
    prompt: async () => { prompted = true; return validDetails; },
    connect: async () => assert.fail('must not connect without MONGODB_URI'),
    provision: async () => assert.fail('must not provision without MONGODB_URI'),
    disconnect: async () => {},
    output: { log() {} }
  }), /MONGODB_URI is missing/);
  assert.equal(prompted, false);
});
