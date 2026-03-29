const User = require('../models/User');

async function loadCurrentUser(req, res, next) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.locals.currentUser = currentUser;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = loadCurrentUser;
