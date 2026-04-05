const express = require('express');

const isAuthenticated = require('../middleware/isAuthenticated');
const loadCurrentUser = require('../middleware/loadCurrentUser');
const User = require('../models/User');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const AssignmentRequest = require('../models/AssignmentRequest');
const {
  pruneInvalidPushTokens,
  sendPushNotificationToUser,
} = require('../utils/pushNotifications');

const router = express.Router();

router.use(isAuthenticated);
router.use(loadCurrentUser);

function ensureFriends(user, friendId) {
  return (user.friends || []).some((id) => String(id) === String(friendId));
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
  const me = res.locals.currentUser;
  const targetUser = await resolveTargetUser(req.body);
  if (!targetUser) {
    return res.status(404).json({ message: 'Target friend not found' });
  }

  const isFriend = ensureFriends(me, targetUser._id);
  if (!isFriend) {
    return res.status(403).json({ message: 'You can only assign planner tasks to friends' });
  }

  const { title, notes = '', date } = req.body;
  const time = String(req.body.time || '').trim();
  if (!title || !date || !time) {
    return res.status(400).json({ message: 'title, date and time are required' });
  }

  const assignment = await AssignmentRequest.create({
    fromUser: me._id,
    toUser: targetUser._id,
    itemType: 'task',
    title,
    notes,
    date,
    time,
  });

  try {
    const invalidTokens = await sendPushNotificationToUser(targetUser, {
      title: 'New Planner Request',
      body: `${me.displayName || me.username} sent you a planner for ${date} at ${time}.`,
      data: {
        notificationType: 'incoming-planner-request',
        assignmentId: String(assignment._id),
      },
    });
    await pruneInvalidPushTokens(User, targetUser._id, invalidTokens);
  } catch (e) { /* ignore push errors */ }

  return res.status(201).json(assignment);
});

router.post('/reminder', async (req, res) => {
  const me = res.locals.currentUser;
  const targetUser = await resolveTargetUser(req.body);
  if (!targetUser) {
    return res.status(404).json({ message: 'Target friend not found' });
  }

  const isFriend = ensureFriends(me, targetUser._id);
  if (!isFriend) {
    return res.status(403).json({ message: 'You can only assign reminders to friends' });
  }

  const { title, notes = '', date } = req.body;
  const time = String(req.body.time || '').trim();
  if (!title || !date || !time) {
    return res.status(400).json({ message: 'title, date and time are required' });
  }

  const assignment = await AssignmentRequest.create({
    fromUser: me._id,
    toUser: targetUser._id,
    itemType: 'reminder',
    title,
    notes,
    date,
    time,
  });

  try {
    const invalidTokens = await sendPushNotificationToUser(targetUser, {
      title: 'New Reminder Request',
      body: `${me.displayName || me.username} sent you a reminder for ${date} at ${time}.`,
      data: {
        notificationType: 'incoming-reminder-request',
        assignmentId: String(assignment._id),
      },
    });
    await pruneInvalidPushTokens(User, targetUser._id, invalidTokens);
  } catch (e) { /* ignore push errors */ }

  return res.status(201).json(assignment);
});

router.get('/incoming', async (req, res) => {
  const requestedStatus = (req.query.status || 'pending').toLowerCase();
  const allowed = ['pending', 'approved', 'rejected', 'all'];
  if (!allowed.includes(requestedStatus)) {
    return res.status(400).json({ message: 'status must be pending, approved, rejected or all' });
  }

  const incomingQuery = {
    toUser: res.locals.currentUser._id,
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
    fromUser: res.locals.currentUser._id,
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
  const me = res.locals.currentUser;
  const action = req.body.action;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'action must be approve or reject' });
  }

  const assignment = await AssignmentRequest.findOne({
    _id: req.params.assignmentId,
    toUser: res.locals.currentUser._id,
    status: 'pending',
  });

  if (!assignment) {
    return res.status(404).json({ message: 'Assignment request not found' });
  }

  const fromUser = await User.findById(assignment.fromUser);

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
        owner: me._id,
        createdBy: assignment.fromUser,
      });
    } else {
      await Reminder.create({
        title: assignment.title,
        notes: assignment.notes,
        date: assignment.date,
        time: assignment.time,
        owner: me._id,
        createdBy: assignment.fromUser,
      });
    }

    try {
      const invalidTokens = await sendPushNotificationToUser(fromUser, {
        title: assignment.itemType === 'reminder' ? 'Reminder Approved' : 'Planner Approved',
        body: `${me.displayName || me.username} approved your ${assignment.itemType}.`,
        data: {
          notificationType:
            assignment.itemType === 'reminder'
              ? 'incoming-reminder-request-approved'
              : 'incoming-planner-request-approved',
          assignmentId: String(assignment._id),
        },
      });
      await pruneInvalidPushTokens(User, fromUser?._id, invalidTokens);
    } catch (e) { /* ignore push errors */ }
  } else {
    assignment.status = 'rejected';
    await assignment.save();

    try {
      const invalidTokens = await sendPushNotificationToUser(fromUser, {
        title: assignment.itemType === 'reminder' ? 'Reminder Rejected' : 'Planner Rejected',
        body: `${me.displayName || me.username} rejected your ${assignment.itemType}.`,
        data: {
          notificationType:
            assignment.itemType === 'reminder'
              ? 'incoming-reminder-request-rejected'
              : 'incoming-planner-request-rejected',
          assignmentId: String(assignment._id),
        },
      });
      await pruneInvalidPushTokens(User, fromUser?._id, invalidTokens);
    } catch (e) { /* ignore push errors */ }
  }

  return res.json({ message: `Assignment ${assignment.status}` });
});

module.exports = router;
