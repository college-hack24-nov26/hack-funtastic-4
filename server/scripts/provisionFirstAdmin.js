require('dotenv').config();

const readlinePromises = require('node:readline/promises');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const authService = require('../src/services/authService');
const { promptHidden } = require('./terminalPrompts');

function inputError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateAdminInput({ displayName, email, password } = {}) {
  if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 80) {
    throw inputError('Display name must be between 2 and 80 characters.');
  }
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw inputError('Enter a valid administrator email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw inputError('Password must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }
}

async function promptAdminDetails(input = process.stdin, output = process.stdout) {
  const rl = readlinePromises.createInterface({ input, output });
  try {
    const displayName = await rl.question('Administrator display name: ');
    const email = await rl.question('Administrator email: ');
    const password = await promptHidden('Administrator password (hidden): ', input, output);
    const details = { displayName, email, password };
    validateAdminInput(details);
    return details;
  } finally {
    rl.close();
  }
}

async function runProvision({
  mongoUri,
  prompt = promptAdminDetails,
  connect = connectDatabase,
  provision = authService.provisionFirstAdmin,
  disconnect = () => mongoose.disconnect(),
  output = console
}) {
  if (!mongoUri) throw inputError('MONGODB_URI is missing. Set it in the local .env file first.', 1);

  const details = await prompt();
  validateAdminInput(details);
  let connectionAttempted = false;
  try {
    connectionAttempted = true;
    await connect(mongoUri);
    await provision(details);
    output.log('The first administrator account was created. Credentials were not displayed.');
  } finally {
    details.password = '';
    if (connectionAttempted) await disconnect();
  }
}

async function main() {
  try {
    await runProvision({ mongoUri: process.env.MONGODB_URI });
  } catch (error) {
    const message = error.statusCode === 400 || error.statusCode === 409 || error.statusCode === 1
      ? error.message
      : 'Administrator provisioning failed. Check database connectivity and local configuration.';
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { promptAdminDetails, runProvision, validateAdminInput };
