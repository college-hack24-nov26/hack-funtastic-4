require('dotenv').config();

const readlinePromises = require('node:readline/promises');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const authService = require('../src/services/authService');
const { promptHidden } = require('./terminalPrompts');

function cliError(message, statusCode = 1) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateInput({ email, password } = {}) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw cliError('Enter a valid administrator email address.', 400);
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw cliError('Administrator password must be at least 12 characters and no more than 72 UTF-8 bytes.', 400);
  }
}

async function promptPasswordChange(input = process.stdin, output = process.stdout) {
  const rl = readlinePromises.createInterface({ input, output });
  try {
    const email = await rl.question('Administrator email: ');
    const password = await promptHidden('New administrator password (hidden): ', input, output);
    const details = { email, password };
    validateInput(details);
    return details;
  } finally {
    rl.close();
  }
}

async function runPasswordChange({
  mongoUri,
  prompt = promptPasswordChange,
  connect = connectDatabase,
  changePassword = authService.changeAdminPassword,
  disconnect = () => mongoose.disconnect(),
  output = console
}) {
  if (!mongoUri) throw cliError('MONGODB_URI is missing. Set it in the local .env file first.');

  const details = await prompt();
  validateInput(details);
  let connectionAttempted = false;
  try {
    connectionAttempted = true;
    await connect(mongoUri);
    await changePassword(details);
    output.log('Administrator password updated. The password was not displayed.');
  } finally {
    details.password = '';
    if (connectionAttempted) await disconnect();
  }
}

async function main() {
  try {
    await runPasswordChange({ mongoUri: process.env.MONGODB_URI });
  } catch (error) {
    const message = [400, 403, 404, 409].includes(error.statusCode)
      ? error.message
      : 'Administrator password change failed. Check database connectivity and local configuration.';
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { promptPasswordChange, runPasswordChange, validateInput };
