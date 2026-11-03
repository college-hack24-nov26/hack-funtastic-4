const mongoose = require('mongoose');

async function connectDatabase(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  mongoose.connection.on('error', (error) => {
    console.error(`MongoDB connection error (${error.name}).`);
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });
}

module.exports = connectDatabase;
