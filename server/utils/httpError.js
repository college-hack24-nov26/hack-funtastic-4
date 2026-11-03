/*
 * Shared HttpError utility. Both middleware/errorHandler.js and
 * middleware/validate.js import from here so the class identity is the
 * same everywhere.
 */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = HttpError;
