const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

router.get("/ready", (req, res) => {
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected, 2 connecting
  if (state === 1) {
    return res.json({ ready: true, database: "connected" });
  }
  res.status(503).json({ ready: false, database: ["disconnected", "connecting"][state] || "unknown" });
});

module.exports = router;
