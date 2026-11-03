require("dotenv").config();
const mongoose = require("mongoose");

let connected = false;

async function connectDatabase(uri) {
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and configure it.");
  }
  mongoose.set("strictQuery", true);
  mongoose.connection.on("error", (err) => {
    console.error("[db] connection error:", err.message);
    connected = false;
  });
  mongoose.connection.on("disconnected", () => { connected = false; });
  mongoose.connection.on("connected", () => { connected = true; });
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  connected = true;
  console.log("[db] connected to MongoDB");
  return mongoose.connection;
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function disconnectDatabase() {
  connected = false;
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, isConnected };
