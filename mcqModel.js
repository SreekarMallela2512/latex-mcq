const mongoose = require('mongoose');

const mcqSchema = new mongoose.Schema({
  questionNo: {
    type: String,
    required: true,
    trim: true
  },
  question: String,
  options: [String],
  correctOption: Number,
  subject: String,
  topic: String,
  difficulty: String,
  pyqType: {
    type: String,
    enum: ['JEE MAIN PYQ', 'JEE ADVANCED PYQ', 'NEET PYQ', 'Other', 'Not PYQ'],
    default: 'Not PYQ'
  },
  session: {
    type: String,
    enum: ['Session 1', 'Session 2', 'N/A'],
    default: 'N/A'
  },
  year: {
    type: Number,
    min: 2000,
    max: new Date().getFullYear()
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MCQ', mcqSchema);