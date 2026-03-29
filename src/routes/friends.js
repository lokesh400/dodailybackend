const express = require('express');

const isAuthenticated = require('../middleware/isAuthenticated');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const AssignmentRequest = require('../models/AssignmentRequest');

const router = express.Router();


router.use(isAuthenticated);

// Middleware: block if not verified
router.use((req, res, next) => {
  if (!req.user?.verified) {
    return res.status(403).json({ message: 'Please verify your mail first' });
  }
  next();
});

router.get('/', async (req, res) => {
  const me = await User.findById(req.user._id).populate('friends', 'username displayName');
  return res.json({
    friends: me.friends || [],
  });
});

router.post('/request', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();

  if (!username) {
    return res.status(400).json({ message: 'username is required' });
  }

  const targetUser = await User.findOne({ username });
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (String(targetUser._id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot add yourself' });
  }

  const me = await User.findById(req.user._id);
  const alreadyFriends = (me.friends || []).some((friendId) => String(friendId) === String(targetUser._id));
  if (alreadyFriends) {
    return res.status(409).json({ message: 'Already friends' });
  }

  const duplicatePending = await FriendRequest.findOne({
    status: 'pending',
    $or: [
      { fromUser: req.user._id, toUser: targetUser._id },
      { fromUser: targetUser._id, toUser: req.user._id },
    ],
  });

  if (duplicatePending) {
    return res.status(409).json({ message: 'Friend request already pending' });
  }

  const friendRequest = await FriendRequest.create({
    fromUser: req.user._id,
    toUser: targetUser._id,
  });

  return res.status(201).json(friendRequest);
});

router.get('/requests', async (req, res) => {
  const requestedStatus = (req.query.status || 'pending').toLowerCase();
  const allowed = ['pending', 'accepted', 'rejected', 'all'];
  if (!allowed.includes(requestedStatus)) {
    return res.status(400).json({ message: 'status must be pending, accepted, rejected or all' });
  }

  const incomingQuery = {
    toUser: req.user._id,
  };
  const outgoingQuery = {
    fromUser: req.user._id,
  };

  if (requestedStatus !== 'all') {
    incomingQuery.status = requestedStatus;
    outgoingQuery.status = requestedStatus;
  }

  const incoming = await FriendRequest.find({
    ...incomingQuery,
  })
    .populate('fromUser', 'username displayName')
    .sort({ createdAt: -1 });

  const outgoing = await FriendRequest.find({
    ...outgoingQuery,
  })
    .populate('toUser', 'username displayName')
    .sort({ createdAt: -1 });

  return res.json({ incoming, outgoing });
});

router.get('/badges', async (req, res) => {
  const [pendingFriendRequests, pendingAssignmentApprovals] = await Promise.all([
    FriendRequest.countDocuments({ toUser: req.user._id, status: 'pending' }),
    AssignmentRequest.countDocuments({ toUser: req.user._id, status: 'pending' }),
  ]);

  return res.json({
    pendingFriendRequests,
    pendingAssignmentApprovals,
    totalPendingApprovals: pendingFriendRequests + pendingAssignmentApprovals,
  });
});

router.patch('/requests/:requestId/respond', async (req, res) => {
  const action = req.body.action;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'action must be approve or reject' });
  }

  const friendRequest = await FriendRequest.findOne({
    _id: req.params.requestId,
    toUser: req.user._id,
    status: 'pending',
  });

  if (!friendRequest) {
    return res.status(404).json({ message: 'Friend request not found' });
  }

  if (action === 'approve') {
    friendRequest.status = 'accepted';
    await friendRequest.save();

    await User.findByIdAndUpdate(friendRequest.fromUser, { $addToSet: { friends: friendRequest.toUser } });
    await User.findByIdAndUpdate(friendRequest.toUser, { $addToSet: { friends: friendRequest.fromUser } });
  } else {
    friendRequest.status = 'rejected';
    await friendRequest.save();
  }

  return res.json({ message: `Friend request ${friendRequest.status}` });
});

module.exports = router;
