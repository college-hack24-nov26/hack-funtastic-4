const readline = require('node:readline');

function inputError(message, statusCode = 1) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function promptHidden(prompt, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(inputError('Hidden password entry requires an interactive terminal such as PowerShell or the VS Code terminal.'));
  }

  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(input);
    const previousRawMode = input.isRaw;
    let value = '';
    let settled = false;

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(Boolean(previousRawMode));
      input.pause();
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (sequence, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        finish(inputError('Password entry cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        finish();
      } else if (key.name === 'backspace' || key.name === 'delete') {
        value = Array.from(value).slice(0, -1).join('');
      } else if (!key.ctrl && !key.meta && sequence && !/[\u0000-\u001f\u007f]/u.test(sequence)) {
        value += sequence;
      }
    };

    output.write(prompt);
    input.on('keypress', onKeypress);
    try {
      input.setRawMode(true);
      input.resume();
    } catch (error) {
      finish(inputError('Unable to enable hidden password input in this terminal.'));
    }
  });
}

module.exports = { promptHidden };
