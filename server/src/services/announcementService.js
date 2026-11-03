const mongoose = require('mongoose');
const Announcement = require('../models/announcement');

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('A valid announcement is required.');
  const allowed = ['title', 'description', 'category', 'important'];
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !allowed.includes(key))) throw fail('Announcement fields are invalid.');
  if (!partial && ['title', 'description', 'category'].some((key) => !(key in input))) throw fail('Title, description, and category are required.');
  const value = {};
  for (const field of ['title', 'description', 'category']) {
    if (!(field in input)) continue;
    if (typeof input[field] !== 'string') throw fail(`${field} must be text.`);
    const clean = input[field].trim();
    const limits = { title: [3, 180], description: [5, 4000], category: [2, 60] }[field];
    if (clean.length < limits[0] || clean.length > limits[1]) throw fail(`${field} length is invalid.`);
    value[field] = clean;
  }
  if ('important' in input) {
    if (typeof input.important !== 'boolean') throw fail('Important must be true or false.');
    value.important = input.important;
  }
  return value;
}

async function listPublished() {
  const announcements = await Announcement.find({ publicationStatus: 'published' })
    .select('title description category important publishedAt')
    .sort({ publishedAt: -1 }).limit(20).lean();
  return { announcements };
}

async function getPublished(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('Announcement identifier is invalid.');
  const announcement = await Announcement.findOne({ _id: id, publicationStatus: 'published' })
    .select('title description category important publishedAt')
    .lean();
  if (!announcement) throw fail('Announcement not found.', 404);
  return { announcement };
}

async function listAdmin(status = 'all') {
  if (!['all', 'draft', 'published'].includes(status)) throw fail('Announcement status is invalid.');
  const filter = status === 'all' ? {} : { publicationStatus: status };
  return { announcements: await Announcement.find(filter).sort({ updatedAt: -1 }).lean() };
}

async function create(input, adminId) {
  return { announcement: await Announcement.create({ ...validateInput(input), createdBy: adminId }) };
}

async function update(id, input) {
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('Announcement identifier is invalid.');
  const announcement = await Announcement.findById(id);
  if (!announcement) throw fail('Announcement not found.', 404);
  announcement.set(validateInput(input, { partial: true }));
  await announcement.save();
  return { announcement };
}

async function setPublication(id, publicationStatus) {
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('Announcement identifier is invalid.');
  if (!['draft', 'published'].includes(publicationStatus)) throw fail('Publication status must be draft or published.');
  const announcement = await Announcement.findById(id);
  if (!announcement) throw fail('Announcement not found.', 404);
  announcement.publicationStatus = publicationStatus;
  announcement.publishedAt = publicationStatus === 'published' ? (announcement.publishedAt || new Date()) : null;
  await announcement.save();
  return { announcement };
}

module.exports = { create, getPublished, listAdmin, listPublished, setPublication, update };
