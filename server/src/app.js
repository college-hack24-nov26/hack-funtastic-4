const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentProfileRoutes = require('./routes/studentProfileRoutes');
const learningContentRoutes = require('./routes/learningContentRoutes');
const adminLearningContentRoutes = require('./routes/adminLearningContentRoutes');
const learningProgressRoutes = require('./routes/learningProgressRoutes');
const teacherLearningRoutes = require('./routes/teacherLearningRoutes');
const adminTeacherRoutes = require('./routes/adminTeacherRoutes');
const studentDashboardRoutes = require('./routes/studentDashboardRoutes');
const adminAnnouncementRoutes = require('./routes/adminAnnouncementRoutes');
const guardianRoutes = require('./routes/guardianRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const publicDirectory = path.join(__dirname, '..', '..', 'public');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  response.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'disconnected'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/content', adminLearningContentRoutes);
app.use('/api/admin/teachers', adminTeacherRoutes);
app.use('/api/admin/announcements', adminAnnouncementRoutes);
app.use('/api/guardian', guardianRoutes);
app.use('/api/student', studentDashboardRoutes);
app.use('/api/student', studentProfileRoutes);
app.use('/api/learning/progress', learningProgressRoutes);
app.use('/api/learning/teachers', teacherLearningRoutes);
app.use('/api/learning', learningContentRoutes);
app.use(express.static(publicDirectory));

app.use((request, response, next) => {
  const error = new Error('Not found.');
  error.statusCode = 404;
  next(error);
});

app.use(errorHandler);

module.exports = app;
