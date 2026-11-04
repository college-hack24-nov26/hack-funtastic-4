function requireGuardian(request, response, next) {
  if (request.user?.role !== 'guardian') {
    return response.status(403).json({ error: 'Guardian access is required.' });
  }
  return next();
}

module.exports = requireGuardian;
