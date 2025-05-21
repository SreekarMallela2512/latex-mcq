const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const MCQ = require('./mcqModel');
const app = express();

mongoose.connect('mongodb://localhost:27017/mcqdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.post('/submit', async (req, res) => {
  const { question, options, correctOption, subject, topic, difficulty } = req.body;

  const mcq = new MCQ({
    question,
    options,
    correctOption,
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
