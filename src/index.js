require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');

const User = require('./models/User');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const reminderRoutes = require('./routes/reminders');

const app = express();

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/daily-planner';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:8081';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  await mongoose.connect(MONGO_URI);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
