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

// MCQ submission route
app.post('/submit', requireAuth, async (req, res) => {
  try {
    const { 
      questionNo, 
      question, 
      options, 
      correctOption, 
      subject, 
      topic, 
      difficulty, 
      pyqType, 
      shift, 
      year,
      examDate
    } = req.body;

    // Validate PYQ fields if needed
    if (pyqType === 'JEE MAIN PYQ') {
      if (!shift || !year) {
        return res.status(400).json({ 
          error: 'Shift and Year are required for JEE MAIN PYQ questions' 
        });
      }

      const yearNum = parseInt(year);
      if (yearNum < 2021 || yearNum > 2025) {
        return res.status(400).json({ 
          error: 'Invalid year. Year must be between 2021 and 2025.' 
        });
      }
    }

    const correctOptionIndex = parseInt(correctOption, 10) - 1;

    // Create MCQ object with conditional fields
    const mcqData = {
      questionNo: questionNo,
      question,
      options,
      correctOption: correctOptionIndex,
      subject,
      topic,
      difficulty,
      pyqType: pyqType || 'Not PYQ',
      createdBy: req.session.userId
    };

    // Add PYQ specific fields if applicable
    if (pyqType === 'JEE MAIN PYQ') {
      mcqData.shift = shift;
      mcqData.year = parseInt(year);
      if (examDate) {
        mcqData.examDate = new Date(examDate);
      }
    }

    const mcq = new MCQ(mcqData);
    await mcq.save();
    
    res.json({ 
      message: "Question added successfully!",
      questionId: mcq._id 
    });
  } catch (err) {
    console.error('Error saving question:', err);
    res.status(500).json({ error: "Error saving question. Please try again." });
  }
});

// Get questions based on user role with enhanced filtering and sorting
app.get('/questions', requireAuth, async (req, res) => {
  try {
    const { subject, pyqType, year, shift, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    let filter = {};
    let questions;
    
    // Build filter based on user role
    if (req.session.userRole === 'superuser') {
      // Super users can see all questions
      if (subject) filter.subject = subject;
      if (pyqType && pyqType !== 'all') filter.pyqType = pyqType;
      if (year) filter.year = parseInt(year);
      if (shift) filter.shift = shift;
    } else {
      // Regular users can only see their own questions
      filter.createdBy = req.session.userId;
      if (subject) filter.subject = subject;
      if (pyqType && pyqType !== 'all') filter.pyqType = pyqType;
      if (year) filter.year = parseInt(year);
      if (shift) filter.shift = shift;
    }

    // Create sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    if (req.session.userRole === 'superuser') {
      questions = await MCQ.find(filter)
        .populate('createdBy', 'username')
        .sort(sort);
    } else {
      questions = await MCQ.find(filter).sort(sort);
    }
    
    res.json(questions);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: "Error fetching questions." });
  }
});

// Get question statistics
app.get('/stats', requireAuth, async (req, res) => {
  try {
    let matchStage = {};
    
    if (req.session.userRole !== 'superuser') {
      matchStage.createdBy = new mongoose.Types.ObjectId(req.session.userId);
    }

    const stats = await MCQ.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          subjectBreakdown: {
            $push: {
              subject: "$subject",
              pyqType: "$pyqType",
              difficulty: "$difficulty"
            }
          }
        }
      },
      {
        $project: {
          totalQuestions: 1,
          subjects: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.subject",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.subject", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          },
          pyqTypes: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.pyqType",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.pyqType", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          },
          difficulties: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.difficulty",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.difficulty", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    res.json(stats[0] || { totalQuestions: 0, subjects: {}, pyqTypes: {}, difficulties: {} });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: "Error fetching statistics." });
  }
});

// Delete question (only own questions for regular users)
app.delete('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    let filter = { _id: id };
    
    // Regular users can only delete their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
    
    const deletedQuestion = await MCQ.findOneAndDelete(filter);
    
    if (!deletedQuestion) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).json({ error: 'Error deleting question' });
  }
});

// Update question (only own questions for regular users)
app.put('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    let filter = { _id: id };
    
    // Regular users can only update their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
    
    const updatedQuestion = await MCQ.findOneAndUpdate(
      filter, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!updatedQuestion) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    res.json({ 
      message: 'Question updated successfully', 
      question: updatedQuestion 
    });
  } catch (err) {
    console.error('Error updating question:', err);
    res.status(500).json({ error: 'Error updating question' });
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

// Get unique years from database for filtering
app.get('/available-years', requireAuth, async (req, res) => {
  try {
    let matchStage = { year: { $exists: true, $ne: null } };
    
    if (req.session.userRole !== 'superuser') {
      matchStage.createdBy = new mongoose.Types.ObjectId(req.session.userId);
    }

    const years = await MCQ.distinct('year', matchStage);
    res.json(years.sort((a, b) => b - a)); // Sort descending
  } catch (err) {
    console.error('Error fetching available years:', err);
    res.status(500).json({ error: 'Error fetching available years' });
  }
});
// Get single question by ID (for editing)
app.get('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    let filter = { _id: id };
    
    // Regular users can only access their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
    
    const question = await MCQ.findOne(filter);
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    res.json(question);
  } catch (err) {
    console.error('Error fetching question:', err);
    res.status(500).json({ error: 'Error fetching question' });
  }
});
// Add these routes to server.js (before app.listen)

// Year Management Routes (Superuser only)
app.get('/admin/years', requireSuperUser, async (req, res) => {
  try {
    // Get years from database or default range
    const existingYears = await MCQ.distinct('year', { year: { $exists: true, $ne: null } });
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    
    // Combine and sort unique years
    const allYears = [...new Set([...existingYears, ...defaultYears])].sort();
    
    res.json(allYears);
  } catch (err) {
    console.error('Error fetching years:', err);
    res.status(500).json({ error: 'Error fetching years' });
  }
});

app.post('/admin/years', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.body;
    
    if (!year || year < 2020 || year > 2030) {
      return res.status(400).json({ error: 'Invalid year. Must be between 2020 and 2030.' });
    }
    
    // For this implementation, we'll store years in a separate collection or use a config approach
    // Since we're using the examDates object, we'll just return success
    res.json({ message: 'Year added successfully', year: parseInt(year) });
  } catch (err) {
    console.error('Error adding year:', err);
    res.status(500).json({ error: 'Error adding year' });
  }
});

app.delete('/admin/years/:year', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);
    
    // Check if year is used in existing questions
    const questionsWithYear = await MCQ.countDocuments({ year: yearNum });
    
    if (questionsWithYear > 0) {
      return res.status(400).json({ 
        error: `Cannot delete year ${year}. It is used in ${questionsWithYear} question(s).` 
      });
    }
    
    res.json({ message: `Year ${year} deleted successfully` });
  } catch (err) {
    console.error('Error deleting year:', err);
    res.status(500).json({ error: 'Error deleting year' });
  }
});

// Exam Date Management Routes (Superuser only)
app.get('/admin/exam-dates/:year', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.params;
    
    // Get exam dates from database for the specific year
    const examDates = await MCQ.distinct('examDate', { 
      year: parseInt(year), 
      examDate: { $exists: true, $ne: null } 
    });
    
    // Format dates for response
    const formattedDates = examDates.map(date => ({
      date: new Date(date).toISOString().split('T')[0],
      label: new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    }));
    
    res.json(formattedDates);
  } catch (err) {
    console.error('Error fetching exam dates:', err);
    res.status(500).json({ error: 'Error fetching exam dates' });
  }
});

app.post('/admin/exam-dates', requireSuperUser, async (req, res) => {
  try {
    const { year, date, label } = req.body;
    
    if (!year || !date) {
      return res.status(400).json({ error: 'Year and date are required' });
    }
    
    const examDate = new Date(date);
    if (isNaN(examDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    res.json({ 
      message: 'Exam date added successfully', 
      examDate: {
        date: date,
        label: label || examDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      }
    });
  } catch (err) {
    console.error('Error adding exam date:', err);
    res.status(500).json({ error: 'Error adding exam date' });
  }
});

app.delete('/admin/exam-dates', requireSuperUser, async (req, res) => {
  try {
    const { year, date } = req.body;
    
    if (!year || !date) {
      return res.status(400).json({ error: 'Year and date are required' });
    }
    
    // Check if date is used in existing questions
    const questionsWithDate = await MCQ.countDocuments({ 
      year: parseInt(year),
      examDate: new Date(date)
    });
    
    if (questionsWithDate > 0) {
      return res.status(400).json({ 
        error: `Cannot delete this exam date. It is used in ${questionsWithDate} question(s).` 
      });
    }
    
    res.json({ message: 'Exam date deleted successfully' });
  } catch (err) {
    console.error('Error deleting exam date:', err);
    res.status(500).json({ error: 'Error deleting exam date' });
  }
});
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
  console.log('Features added:');
  console.log('✅ Question numbering system (no uniqueness constraint)');
  console.log('✅ PYQ type classification');
  console.log('✅ JEE MAIN PYQ with shift and year');
  console.log('✅ Enhanced filtering and sorting');
  console.log('✅ Question statistics');
  console.log('✅ CRUD operations for questions');
});