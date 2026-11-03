const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");
const { hashPassword } = require("../middleware/authenticate");
const User = require("../models/user");

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  await connectDatabase(uri);
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    console.error("[seed] BOOTSTRAP_ADMIN_PASSWORD is not set. Refusing to bootstrap without a password.");
    process.exit(1);
  }
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    console.log(`[seed] Admin user ${email} already exists. Skipping.`);
  } else {
    await User.create({
      email,
      passwordHash: await hashPassword(password),
      displayName: "Administrator",
      role: "admin",
      ageGroup: "18+",
    });
    console.log(`[seed] Bootstrapped admin user ${email}.`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  seed().catch((err) => {
    console.error("[seed] failed:", err.message);
    process.exit(1);
  });
}

module.exports = { seed };
