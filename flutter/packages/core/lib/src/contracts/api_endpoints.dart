class AuthEndpoints {
  static const parse = '/api/auth/parse';
  static const refresh = '/api/auth/refresh';
  static const wsTicket = '/api/auth/ws-ticket';
}

class UserEndpoints {
  static const login = '/api/user/login';
  static const register = '/api/user/register';
  static const profile = '/api/user/profile';
  static const search = '/api/user/search';
  static const logout = '/api/user/logout';
  static const heartbeat = '/api/user/heartbeat';
  static const onlineStatus = '/api/user/online-status';
  static const password = '/api/user/password';
  static const phoneCode = '/api/user/phone/code';
  static const phoneBind = '/api/user/phone/bind';
  static const emailCode = '/api/user/email/code';
  static const emailBind = '/api/user/email/bind';
  static const account = '/api/user/account';
  static const settings = '/api/user/settings';
  static String settingsType(String type) =>
      '/api/user/settings/${Uri.encodeComponent(type)}';
  static const avatar = '/api/user/avatar';
  static const offline = '/api/user/offline';
}

class MessageEndpoints {
  static const sendPrivate = '/api/message/send/private';
  static const sendGroup = '/api/message/send/group';
  static String privateHistory(String friendId) =>
      '/api/message/private/${Uri.encodeComponent(friendId)}';
  static String privateHistoryCursor(String friendId) =>
      '/api/message/private/${Uri.encodeComponent(friendId)}/cursor';
  static String groupHistory(String groupId) =>
      '/api/message/group/${Uri.encodeComponent(groupId)}';
  static String groupHistoryCursor(String groupId) =>
      '/api/message/group/${Uri.encodeComponent(groupId)}/cursor';
  static const conversations = '/api/message/conversations';
  static String markRead(String conversationId) =>
      '/api/message/read/${Uri.encodeComponent(conversationId)}';
  static String recall(String messageId) =>
      '/api/message/recall/${Uri.encodeComponent(messageId)}';
  static String delete(String messageId) =>
      '/api/message/delete/${Uri.encodeComponent(messageId)}';
  static const config = '/api/message/config';
}

class FriendEndpoints {
  static const list = '/api/friend/list';
  static const request = '/api/friend/request';
  static const requests = '/api/friend/requests';
  static const accept = '/api/friend/accept';
  static const reject = '/api/friend/reject';
  static const remove = '/api/friend/remove';
  static const remark = '/api/friend/remark';
}

class GroupEndpoints {
  static const create = '/api/group/create';
  static String userGroups(String userId) =>
      '/api/group/user/${Uri.encodeComponent(userId)}';
  static const membersList = '/api/group/members/list';
  static String join(String groupId) =>
      '/api/group/${Uri.encodeComponent(groupId)}/join';
  static String addMembers(String groupId) =>
      '/api/group/${Uri.encodeComponent(groupId)}/add-members';
  static const search = '/api/group/search';
  static String leave(String groupId) =>
      '/api/group/${Uri.encodeComponent(groupId)}/leave';
  static String dismiss(String groupId) =>
      '/api/group/${Uri.encodeComponent(groupId)}';
  static String update(String groupId) =>
      '/api/group/${Uri.encodeComponent(groupId)}';
}

class MomentsEndpoints {
  static const create = '/api/moments';
  static const feed = '/api/moments/feed';
  static String postById(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}';
  static String deletePost(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}';
  static String addMedia(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/media';
  static String userPosts(String userId) =>
      '/api/moments/user/${Uri.encodeComponent(userId)}';
  static String like(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/like';
  static String unlike(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/like';
  static String likes(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/likes';
  static String createComment(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/comments';
  static String deleteComment(String commentId) =>
      '/api/moments/comments/${Uri.encodeComponent(commentId)}';
  static String comments(String postId) =>
      '/api/moments/${Uri.encodeComponent(postId)}/comments';
  static const notifications = '/api/moments/notifications';
  static const markNotificationsRead = '/api/moments/notifications/read';
}

class FileEndpoints {
  static const uploadImage = '/api/file/upload/image';
  static const uploadFile = '/api/file/upload/file';
  static const uploadAudio = '/api/file/upload/audio';
  static const uploadVideo = '/api/file/upload/video';
  static const uploadAvatar = '/api/file/upload/avatar';
  static const download = '/api/file/download';
  static const info = '/api/file/info';
  static const delete = '/api/file/delete';
}

class AiEndpoints {
  static const keys = '/api/ai/keys';
  static String keyById(String id) =>
      '/api/ai/keys/${Uri.encodeComponent(id)}';
  static String keyTest(String id) =>
      '/api/ai/keys/${Uri.encodeComponent(id)}/test';
  static const settings = '/api/ai/settings';
  static const summary = '/api/ai/summary';
  static String stream(String taskId) =>
      '/api/ai/stream/${Uri.encodeComponent(taskId)}';
  static const ragDocs = '/api/ai/rag/docs';
  static String ragDocById(String id) =>
      '/api/ai/rag/docs/${Uri.encodeComponent(id)}';
  static const ragQuery = '/api/ai/rag/query';
}

class PushEndpoints {
  static const registerDevice = '/api/push/devices/register';
  static const unregisterDevice = '/api/push/devices/unregister';
  static const updateDeviceToken = '/api/push/devices/token';
  static const settings = '/api/push/settings';
}

class AdminEndpoints {
  static const logs = '/admin/logs';
}

class E2eeEndpoints {
  static const bundle = '/api/keys/bundle';
  static const devices = '/api/keys/devices';
  static String devicesByUser(String userId) =>
      '/api/e2ee/devices/${Uri.encodeComponent(userId)}';
  static const request = '/api/e2ee/request';
  static const accept = '/api/e2ee/accept';
  static const reject = '/api/e2ee/reject';
  static const disable = '/api/e2ee/disable';
  static const pending = '/api/e2ee/pending';
  static String status(String sessionId) =>
      '/api/e2ee/status/${Uri.encodeComponent(sessionId)}';
  static const heartbeat = '/api/keys/heartbeat';
  static const opkStatus = '/api/keys/opk/status';
  static const opkRefill = '/api/keys/opk/refill';
  static const opkExpired = '/api/keys/opk/expired';
  static const otkCount = '/api/keys/otk-count';
  static const otk = '/api/keys/otk';
  static const salt = '/api/keys/salt';
  static const backup = '/api/keys/backup';
  static String deleteDevice(String deviceId) =>
      '/api/keys/device/${Uri.encodeComponent(deviceId)}';
  static const createSession = '/api/e2ee/sessions';
  static String conversationSession(String conversationId) =>
      '/api/e2ee/conversations/${Uri.encodeComponent(conversationId)}/session';
  static String rotateConversationSession(String conversationId) =>
      '/api/e2ee/conversations/${Uri.encodeComponent(conversationId)}/rotate';
  static String groupEnable(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/enable';
  static String groupDisable(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/disable';
  static String groupSenderKey(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/sender-key';
  static String groupSenderKeys(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/sender-keys';
  static String groupRemoveSenderKey(String groupId, String userId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/sender-keys/${Uri.encodeComponent(userId)}';
  static String groupStatus(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/status';
  static String groupDevices(String groupId) =>
      '/api/e2ee/groups/${Uri.encodeComponent(groupId)}/devices';
}

class WsEndpoints {
  static const path = '/websocket';
  static const ticketParam = 'ticket';
}
