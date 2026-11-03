const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const LibraryEntry = require("../models/library").LibraryEntry;
const Story = require("../models/story").Story;
const Quest = require("../models/quest").Quest;
const GameDef = require("../models/quest").GameDef;
const Mission = require("../models/mission").Mission;
const Quiz = require("../models/quiz").Quiz;
const TeacherChamber = require("../models/teacherChamber").TeacherChamber;
const AshramStage = require("../models/learning").AshramStage;
const Video = require("../models/video").Video;
const User = require("../models/user");

const DEFAULT_DATASET_DIR = path.resolve(__dirname, "..", "..", "dataset");

/* Map dataset file names to (model, required fields). Upsert by slug. */
const COLLECTIONS = {
  library: { model: LibraryEntry, required: ["slug", "title", "category", "summary", "body"] },
  stories: { model: Story, required: ["slug", "title", "summary", "passages", "startPassageKey"] },
  quests: { model: Quest, required: ["slug", "title", "description", "goal"] },
  games: { model: GameDef, required: ["slug", "title", "description", "rules", "kind"] },
  missions: { model: Mission, required: ["slug", "title", "scenario", "objective", "decisions"] },
  quizzes: { model: Quiz, required: ["slug", "title", "questions"] },
  "teacher-chambers": { model: TeacherChamber, required: ["slug", "name", "description", "chapters"] },
  "ashram-stages": { model: AshramStage, required: ["slug", "title", "purpose", "description", "order"] },
  videos: { model: Video, required: ["slug", "title", "description"] },
  users: { model: User, required: ["email", "passwordHash", "displayName"] },
};

function normalizeSlug(fileName) {
  return fileName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function collectionKey(fileName) {
  const base = path.basename(fileName, path.extname(fileName)).toLowerCase();
  return COLLECTIONS[base] ? base : null;
}

function validateRecord(kind, record) {
  const spec = COLLECTIONS[kind];
  const missing = spec.required.filter((f) => record[f] === undefined || record[f] === null || record[f] === "");
  if (missing.length) return { ok: false, reason: `missing required fields: ${missing.join(", ")}` };
  if (!record.slug || !/^[a-z0-9-]+$/.test(String(record.slug))) {
    return { ok: false, reason: "slug must be lowercase letters, numbers and hyphens" };
  }
  return { ok: true };
}

async function importDataset({ datasetDir = DEFAULT_DATASET_DIR, dryRun = false } = {}) {
  const report = { imported: 0, skipped: 0, actions: [], errors: [] };
  if (!datasetDir || !fs.existsSync(datasetDir)) {
    report.errors.push(`dataset directory not found: ${datasetDir}`);
    return report;
  }
  const files = fs.readdirSync(datasetDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const kind = collectionKey(file);
    if (!kind) {
      report.skipped++;
      report.actions.push({ file, action: "skip", reason: "unknown collection" });
      continue;
    }
    const { model, required } = COLLECTIONS[kind];
    let records = [];
    try {
      records = JSON.parse(fs.readFileSync(path.join(datasetDir, file), "utf8"));
      if (!Array.isArray(records)) records = [records];
    } catch (err) {
      report.skipped++;
      report.actions.push({ file, action: "skip", reason: `invalid JSON: ${err.message}` });
      continue;
    }
    for (const record of records) {
      const check = validateRecord(kind, record);
      if (!check.ok) {
        report.skipped++;
        report.actions.push({ file, record: record.slug || record.title, action: "skip", reason: check.reason });
        continue;
      }
      const action = { file, slug: record.slug, action: dryRun ? "would-insert" : "insert" };
      if (!dryRun) {
        try {
          await model.findOneAndUpdate({ slug: record.slug }, { $set: record }, { upsert: true, new: true, setDefaultsOnInsert: true });
          report.imported++;
        } catch (err) {
          report.skipped++;
          action.action = "error";
          action.reason = err.message;
          report.errors.push(`${file}:${record.slug} ${err.message}`);
        }
      }
      report.actions.push(action);
    }
  }
  return report;
}

module.exports = { importDataset, defaultDatasetDir: DEFAULT_DATASET_DIR, COLLECTIONS };
