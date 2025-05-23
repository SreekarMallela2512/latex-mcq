require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const MCQ = require('./mcqModel');
const User = require('./userModel');
const app = express();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB Atlas');
}).catch(err => {
  console.error('❌ Connection error:', err.message);
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Middleware to check super user role
const requireSuperUser = (req, res, next) => {
  if (req.session.userId && req.session.userRole === 'superuser') {
    next();
  } else {
    res.status(403).json({ error: 'Super user access required' });
  }
};

// Authentication routes
app.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = new User({ username, email, password, role: role || 'user' });
    await user.save();
    
    res.json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.userRole = user.role;
    
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Check authentication status
app.get('/auth/status', (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.userRole
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// MCQ routes
app.post('/submit', requireAuth, async (req, res) => {
  const { question, options, correctOption, subject, topic, difficulty } = req.body;

  const correctOptionIndex = parseInt(correctOption, 10) - 1;

  const mcq = new MCQ({
    question,
    options,
    correctOption: correctOptionIndex,
    subject,
    topic,
    difficulty,
    createdBy: req.session.userId
  });

  try {
    await mcq.save();
    res.send("Question added successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving question.");
  }
});

// Get questions based on user role
app.get('/questions', requireAuth, async (req, res) => {
  try {
    let questions;
    
    if (req.session.userRole === 'superuser') {
      // Super users can see all questions with creator info
      questions = await MCQ.find().populate('createdBy', 'username');
    } else {
      // Regular users can only see their own questions
      questions = await MCQ.find({ createdBy: req.session.userId });
    }
    
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching questions.");
  }
});

// Super user only route to get all users
app.get('/users', requireSuperUser, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});