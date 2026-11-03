const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');

const app = express();
const publicDirectory = path.join(__dirname, '..', '..', 'public');

app.use(express.json());
app.use(express.static(publicDirectory));

app.get('/api/health', (request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  response.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'disconnected'
  });
});

module.exports = app;
