require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const MCQ = require('./mcqModel');
const app = express();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB Atlas');
}).catch(err => {
  console.error('❌ Connection error:', err.message);
});




app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.post('/submit', async (req, res) => {
  const { question, options, correctOption, subject, topic, difficulty } = req.body;

  // Convert correctOption from string to number and subtract 1 for zero-based indexing
 const correctOptionIndex = parseInt(correctOption, 10) - 1;


  const mcq = new MCQ({
    question,
    options,
    correctOption: correctOptionIndex,
    subject,
    topic,
    difficulty
  });

  try {
    await mcq.save();
    res.send("Question added successfully!"); // ✅ send string message
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving question.");
  }
});



app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
