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
  const { question, option1, option2, option3, option4, correctOption, subject, topic, difficulty } = req.body;

  const mcq = new MCQ({
    question,
    options: [option1, option2, option3, option4],
    correctOption: parseInt(correctOption),
    subject,
    topic,
    difficulty,
  });

  await mcq.save();
  res.redirect('/');
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
