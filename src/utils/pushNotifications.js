const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHANNEL_ID = 'planner-alerts';

function normalizePushToken(token) {
  return String(token || '').trim();
}

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(
    normalizePushToken(token),
  );
}

function getUserPushTokens(user) {
  return [...new Set((user?.pushTokens || []).map(normalizePushToken))].filter(
    isExpoPushToken,
  );
}

async function sendPushNotificationToUser(user, { title, body, data = {} }) {
  const pushTokens = getUserPushTokens(user);

  if (pushTokens.length === 0) {
    return [];
  }

  const messages = pushTokens.map((pushToken) => ({
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: PUSH_CHANNEL_ID,
  }));

  const response = await axios.post(
    EXPO_PUSH_URL,
    messages.length === 1 ? messages[0] : messages,
    {
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    },
  );

  const ticketData = Array.isArray(response.data?.data)
    ? response.data.data
    : response.data?.data
      ? [response.data.data]
      : [];

  const invalidTokens = ticketData.flatMap((ticket, index) =>
    ticket?.details?.error === 'DeviceNotRegistered'
      ? [messages[index]?.to].filter(Boolean)
      : [],
  );

  return [...new Set(invalidTokens)];
}

async function pruneInvalidPushTokens(User, userId, invalidTokens = []) {
  if (!userId || invalidTokens.length === 0) {
    return;
  }

  await User.findByIdAndUpdate(userId, {
    $pullAll: { pushTokens: invalidTokens },
  });
}

module.exports = {
  normalizePushToken,
  isExpoPushToken,
  sendPushNotificationToUser,
  pruneInvalidPushTokens,
};
