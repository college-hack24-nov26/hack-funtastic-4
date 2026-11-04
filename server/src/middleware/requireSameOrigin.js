function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');

  if (!origin) {
    return response.status(403).json({ error: 'A same-origin request is required.' });
  }

  try {
    const parsedOrigin = new URL(origin);
    const isHttpProtocol = parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:';
    const matchesHost = parsedOrigin.host.toLowerCase() === request.get('host')?.toLowerCase();
    const matchesProtocol = parsedOrigin.protocol === `${request.protocol}:`;

    if (!isHttpProtocol || parsedOrigin.username || parsedOrigin.password || !matchesHost || !matchesProtocol) {
      return response.status(403).json({ error: 'A same-origin request is required.' });
    }
  } catch (error) {
    return response.status(403).json({ error: 'A same-origin request is required.' });
  }

  return next();
}

module.exports = requireSameOrigin;
