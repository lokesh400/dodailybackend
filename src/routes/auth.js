const express = require('express');
const passport = require('passport');

const User = require('../models/User');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      return res.status(400).json({
        message: 'username, password and displayName are required',
      });
    }

    const registeredUser = await User.register(
      new User({ username, displayName }),
      password
    );

    req.login(registeredUser, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Login after signup failed' });
      }

      return res.status(201).json({
        id: registeredUser._id,
        username: registeredUser.username,
        displayName: registeredUser.displayName,
      });
    });
  } catch (error) {
    if (error.name === 'UserExistsError') {
      return res.status(409).json({ message: 'Username already exists' });
    }

    return res.status(500).json({
      message: 'Could not register user',
      error: error.message,
    });
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (error, user) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    return req.login(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return res.json({
        id: user._id,
        username: user.username,
        displayName: user.displayName,
      });
    });
  })(req, res, next);
});

router.post('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      return res.json({ message: 'Logged out successfully' });
    });
  });
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not logged in' });
  }

  return res.json({
    id: req.user._id,
    username: req.user.username,
    displayName: req.user.displayName,
  });
});

module.exports = router;
