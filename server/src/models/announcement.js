const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 180 },
  description: { type: String, required: true, trim: true, minlength: 5, maxlength: 4000 },
  category: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  important: { type: Boolean, default: false },
  publicationStatus: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
  publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, versionKey: false, strict: 'throw' });

announcementSchema.index({ publicationStatus: 1, publishedAt: -1 });

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
