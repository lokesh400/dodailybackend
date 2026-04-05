
const express = require('express');
const isAuthenticated = require('../middleware/isAuthenticated');
const loadCurrentUser = require('../middleware/loadCurrentUser');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const AssignmentRequest = require('../models/AssignmentRequest');
const sendBrevoMail = require('../utils/sendBrevoMail');
const {
  pruneInvalidPushTokens,
  sendPushNotificationToUser,
} = require('../utils/pushNotifications');

const router = express.Router();


router.use(isAuthenticated);
router.use(loadCurrentUser);

// Middleware: block if not verified
router.use((req, res, next) => {
  if (!res.locals.currentUser?.verified) {
    return res.status(403).json({ message: 'Please verify your mail first' });
  }
  next();
});

router.get('/', async (req, res) => {
  const me = await res.locals.currentUser.populate('friends', 'username displayName');
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

  const me = res.locals.currentUser;

  if (String(targetUser._id) === String(me._id)) {
    return res.status(400).json({ message: 'You cannot add yourself' });
  }

  const alreadyFriends = (me.friends || []).some((friendId) => String(friendId) === String(targetUser._id));
  if (alreadyFriends) {
    return res.status(409).json({ message: 'Already friends' });
  }

  const duplicatePending = await FriendRequest.findOne({
    status: 'pending',
    $or: [
      { fromUser: me._id, toUser: targetUser._id },
      { fromUser: targetUser._id, toUser: me._id },
    ],
  });

  if (duplicatePending) {
    return res.status(409).json({ message: 'Friend request already pending' });
  }

  const friendRequest = await FriendRequest.create({
    fromUser: me._id,
    toUser: targetUser._id,
  });

  // Send email notification to target user if they have email
  if (targetUser.email) {
    try {
      await sendBrevoMail({
        to: targetUser.email,
        subject: 'New Friend Request on DoDaily',
        htmlContent: `<div style="font-family:sans-serif;text-align:center;padding:2em;">
          <h2>New Friend Request</h2>
          <p>${me.displayName} (@${me.username}) sent you a friend request on DoDaily.</p>
          <p>Open DoDaily to approve or reject the request.</p>
        </div>`,
      });
    } catch (e) { /* ignore email errors */ }
  }

  try {
    const invalidTokens = await sendPushNotificationToUser(targetUser, {
      title: 'New Friend Request',
      body: `${me.displayName || me.username} sent you a friend request.`,
      data: {
        notificationType: 'friend-request',
        requestId: String(friendRequest._id),
      },
    });
    await pruneInvalidPushTokens(User, targetUser._id, invalidTokens);
  } catch (e) { /* ignore push errors */ }

  return res.status(201).json(friendRequest);
});

router.get('/requests', async (req, res) => {
  const requestedStatus = (req.query.status || 'pending').toLowerCase();
  const allowed = ['pending', 'accepted', 'rejected', 'all'];
  if (!allowed.includes(requestedStatus)) {
    return res.status(400).json({ message: 'status must be pending, accepted, rejected or all' });
  }

  const incomingQuery = {
    toUser: res.locals.currentUser._id,
  };
  const outgoingQuery = {
    fromUser: res.locals.currentUser._id,
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
    FriendRequest.countDocuments({ toUser: res.locals.currentUser._id, status: 'pending' }),
    AssignmentRequest.countDocuments({ toUser: res.locals.currentUser._id, status: 'pending' }),
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
    toUser: res.locals.currentUser._id,
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

    // Notify the requester by email if they have email
    const fromUser = await User.findById(friendRequest.fromUser);
    const toUser = await User.findById(friendRequest.toUser);
    if (fromUser.email) {
      try {
        await sendBrevoMail({
          to: fromUser.email,
          subject: 'Friend Request Accepted on DoDaily',
          htmlContent: `<div style="font-family:sans-serif;text-align:center;padding:2em;">
            <h2>Friend Request Accepted</h2>
            <p>${toUser.displayName} (@${toUser.username}) accepted your friend request on DoDaily.</p>
            <p>You are now friends!</p>
          </div>`
        });
      } catch (e) { /* ignore email errors */ }
    }

    try {
      const invalidTokens = await sendPushNotificationToUser(fromUser, {
        title: 'Friend Request Accepted',
        body: `${toUser.displayName || toUser.username} accepted your friend request.`,
        data: {
          notificationType: 'friend-request-accepted',
          requestId: String(friendRequest._id),
        },
      });
      await pruneInvalidPushTokens(User, fromUser._id, invalidTokens);
    } catch (e) { /* ignore push errors */ }
  } else {
    friendRequest.status = 'rejected';
    await friendRequest.save();

    const fromUser = await User.findById(friendRequest.fromUser);
    const toUser = await User.findById(friendRequest.toUser);

    try {
      const invalidTokens = await sendPushNotificationToUser(fromUser, {
        title: 'Friend Request Rejected',
        body: `${toUser.displayName || toUser.username} rejected your friend request.`,
        data: {
          notificationType: 'friend-request-rejected',
          requestId: String(friendRequest._id),
        },
      });
      await pruneInvalidPushTokens(User, fromUser._id, invalidTokens);
    } catch (e) { /* ignore push errors */ }
  }

  return res.json({ message: `Friend request ${friendRequest.status}` });
});

module.exports = router;
