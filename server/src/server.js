require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Startup failed: PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  startServer();
}

async function startServer() {
  if (!mongoUri) {
    console.error('MongoDB connection skipped: MONGODB_URI is not configured.');
  } else {
    try {
      await connectDatabase(mongoUri);
      console.log('Connected to MongoDB.');
    } catch (error) {
      console.error(
        `MongoDB connection failed (${error.name}). Check MONGODB_URI and database availability.`
      );
    }
  }

  const server = app.listen(port, () => {
    console.log(`MythoVerse server listening on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Startup failed: port ${port} is already in use.`);
    } else {
      console.error(`HTTP server failed to start (${error.code || error.name}).`);
    }

    process.exitCode = 1;
  });
}
