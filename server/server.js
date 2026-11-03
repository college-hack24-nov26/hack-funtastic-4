require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

/* Security headers + parsers */
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false })); // CSP off: static HTML uses inline demo scripts only
app.use(
  cors({
    origin: (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

/* API routes */
app.use("/api", require("./routes/health"));
app.use("/api", require("./routes/auth"));
app.use("/api", require("./routes/student"));
app.use("/api", require("./routes/content"));
app.use("/api", require("./routes/contentAuth"));
app.use("/api", require("./routes/admin"));

/* Static frontend (student + admin modules) */
const path = require("path");
app.use(express.static(path.join(__dirname, ".."), { extensions: ["html"] }));

/* 404 for unmatched API routes, then error handler */
app.use(notFound);
app.use(errorHandler);

async function start() {
  const port = Number(process.env.PORT || 3000);
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "[server] MONGODB_URI is not set. Copy .env.example to .env and configure it, then retry.",
    );
    process.exit(1);
  }
  try {
    await connectDatabase(uri);
  } catch (err) {
    console.error("[server] MongoDB connection failed:", err.message);
    console.error(
      "[server] Verify MongoDB is running and MONGODB_URI is correct, then retry.",
    );
    process.exit(1);
  }
  const server = app.listen(port, () => {
    console.log(`[server] MythoVerse listening on http://localhost:${port}`);
  });
  return server;
}

async function stop() {
  await disconnectDatabase();
}

if (require.main === module) {
  start();
}

module.exports = { app, start, stop };
