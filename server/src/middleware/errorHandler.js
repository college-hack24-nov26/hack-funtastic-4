function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;

  if (statusCode >= 500) {
    console.error(`Request failed (${error.name || 'Error'}).`);
    return response.status(500).json({ error: 'An unexpected error occurred.' });
  }

  return response.status(statusCode).json({ error: error.message });
}

module.exports = errorHandler;
