const express = require('express');

const isAuthenticated = require('../middleware/isAuthenticated');
const User = require('../models/User');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const AssignmentRequest = require('../models/AssignmentRequest');

const router = express.Router();

router.use(isAuthenticated);

async function ensureFriends(userId, friendId) {
  const me = await User.findById(userId);
  return (me.friends || []).some((id) => String(id) === String(friendId));
}

async function resolveTargetUser({ toUserId, toUsername }) {
  if (toUserId) {
    return User.findById(toUserId);
  }

  const username = (toUsername || '').trim().toLowerCase();
  if (!username) {
    return null;
  }

  return User.findOne({ username });
}

router.post('/task', async (req, res) => {
  const targetUser = await resolveTargetUser(req.body);
  if (!targetUser) {
    return res.status(404).json({ message: 'Target friend not found' });
  }

  const isFriend = await ensureFriends(req.user._id, targetUser._id);
  if (!isFriend) {
    return res.status(403).json({ message: 'You can only assign planner tasks to friends' });
  }

  const { title, notes = '', date, time = '' } = req.body;
  if (!title || !date) {
    return res.status(400).json({ message: 'title and date are required' });
  }

  const assignment = await AssignmentRequest.create({
    fromUser: req.user._id,
    toUser: targetUser._id,
    itemType: 'task',
    title,
    notes,
    date,
    time,
  });

  return res.status(201).json(assignment);
});

router.post('/reminder', async (req, res) => {
  const targetUser = await resolveTargetUser(req.body);
  if (!targetUser) {
    return res.status(404).json({ message: 'Target friend not found' });
  }

  const isFriend = await ensureFriends(req.user._id, targetUser._id);
  if (!isFriend) {
    return res.status(403).json({ message: 'You can only assign reminders to friends' });
  }

  const { title, notes = '', date, time = '' } = req.body;
  if (!title || !date) {
    return res.status(400).json({ message: 'title and date are required' });
  }

  const assignment = await AssignmentRequest.create({
    fromUser: req.user._id,
    toUser: targetUser._id,
    itemType: 'reminder',
    title,
    notes,
    date,
    time,
  });

  return res.status(201).json(assignment);
});

router.get('/incoming', async (req, res) => {
  const requestedStatus = (req.query.status || 'pending').toLowerCase();
  const allowed = ['pending', 'approved', 'rejected', 'all'];
  if (!allowed.includes(requestedStatus)) {
    return res.status(400).json({ message: 'status must be pending, approved, rejected or all' });
  }

  const incomingQuery = {
    toUser: req.user._id,
  };
  if (requestedStatus !== 'all') {
    incomingQuery.status = requestedStatus;
  }

  const incoming = await AssignmentRequest.find({
    ...incomingQuery,
  })
    .populate('fromUser', 'username displayName')
    .sort({ createdAt: -1 });

  return res.json(incoming);
});

router.get('/outgoing', async (req, res) => {
  const requestedStatus = (req.query.status || 'all').toLowerCase();
  const allowed = ['pending', 'approved', 'rejected', 'all'];
  if (!allowed.includes(requestedStatus)) {
    return res.status(400).json({ message: 'status must be pending, approved, rejected or all' });
  }

  const outgoingQuery = {
    fromUser: req.user._id,
  };
  if (requestedStatus !== 'all') {
    outgoingQuery.status = requestedStatus;
  }

  const outgoing = await AssignmentRequest.find({
    ...outgoingQuery,
  })
    .populate('toUser', 'username displayName')
    .sort({ createdAt: -1 });

  return res.json(outgoing);
});

router.patch('/:assignmentId/respond', async (req, res) => {
  const action = req.body.action;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'action must be approve or reject' });
  }

  const assignment = await AssignmentRequest.findOne({
    _id: req.params.assignmentId,
    toUser: req.user._id,
    status: 'pending',
  });

  if (!assignment) {
    return res.status(404).json({ message: 'Assignment request not found' });
  }

  if (action === 'approve') {
    assignment.status = 'approved';
    await assignment.save();

    if (assignment.itemType === 'task') {
      await Task.create({
        title: assignment.title,
        notes: assignment.notes,
        date: assignment.date,
        time: assignment.time,
        status: 'pending',
        owner: req.user._id,
        createdBy: assignment.fromUser,
      });
    } else {
      await Reminder.create({
        title: assignment.title,
        notes: assignment.notes,
        date: assignment.date,
        time: assignment.time,
        owner: req.user._id,
        createdBy: assignment.fromUser,
      });
    }
  } else {
    assignment.status = 'rejected';
    await assignment.save();
  }

  return res.json({ message: `Assignment ${assignment.status}` });
});

module.exports = router;
