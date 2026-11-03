function requireAdmin(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: 'Authentication required.' });
  }

  if (request.user.role !== 'admin') {
    return response.status(403).json({ error: 'Admin access is required.' });
  }

  return next();
}

module.exports = requireAdmin;
