const mongoose = require('mongoose');

const mcqSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctOption: Number,
  subject: String,
  topic: String,
  difficulty: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MCQ', mcqSchema);
