function requireStudent(request, response, next) {
  if (request.user?.role !== 'student') {
    return response.status(403).json({ error: 'Student access is required.' });
  }

  return next();
}

module.exports = requireStudent;
