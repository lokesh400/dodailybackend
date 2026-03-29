require('dotenv').config();

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');

const User = require('./src/models/User');
const authRoutes = require('./src/routes/auth');
const taskRoutes = require('./src/routes/tasks');
const reminderRoutes = require('./src/routes/reminders');
const friendsRoutes = require('./src/routes/friends');
const friendAssignmentsRoutes = require('./src/routes/friendAssignments');

const app = express();

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/daily-planner';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:8081';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'dodaily.sid';
const MongoStore = connectMongo.default || connectMongo.MongoStore || connectMongo;
const allowedOrigins = CLIENT_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const sessionStore =
  typeof MongoStore.create === 'function'
    ? MongoStore.create({
        mongoUrl: MONGO_URI,
        collectionName: 'sessions',
      })
    : new MongoStore({
        mongoUrl: MONGO_URI,
        collectionName: 'sessions',
      });

app.use(
  cors({
    origin(origin, callback) {
      // React Native requests often arrive without a browser Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: false,
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
  res.status(200).send('OK');
});

app.get('/auth/user/verify/user/:token', (req, res) => {
  const token = encodeURIComponent(req.params.token);
  return res.redirect(302, `/api/auth/user/verify/user/${token}`);
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/friend-assignments', friendAssignmentsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

function startKeepAlive(port) {
  setInterval(async () => {
    const result = await axios.get(`https://dodaily.onrender.com/health`, { timeout: 5000 }).catch(err => {
      console.error('Keep-alive error:', err.message);
      return null;
    });
    if (result) console.log(`🔄 Keep-alive ping → ${result.status} OK`);
  }, 10000);
}

async function start() {
  await mongoose.connect(MONGO_URI);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startKeepAlive();
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
