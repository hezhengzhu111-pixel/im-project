class AuthEndpoints {
  static const parse = '/auth/parse';
  static const refresh = '/auth/refresh';
  static const wsTicket = '/auth/ws-ticket';
}

class UserEndpoints {
  static const login = '/user/login';
  static const register = '/user/register';
  static const profile = '/user/profile';
  static const search = '/user/search';
  static const logout = '/user/logout';
  static const heartbeat = '/user/heartbeat';
  static const onlineStatus = '/user/online-status';
  static const password = '/user/password';
  static const phoneCode = '/user/phone/code';
  static const phoneBind = '/user/phone/bind';
  static const emailCode = '/user/email/code';
  static const emailBind = '/user/email/bind';
  static const account = '/user/account';
  static const settings = '/user/settings';
  static String settingsType(String type) => '/user/settings/$type';
}

class MessageEndpoints {
  static const sendPrivate = '/message/send/private';
  static const sendGroup = '/message/send/group';
  static String privateHistory(String friendId) => '/message/private/$friendId';
  static String privateHistoryCursor(String friendId) =>
      '/message/private/$friendId/cursor';
  static String groupHistory(String groupId) => '/message/group/$groupId';
  static String groupHistoryCursor(String groupId) =>
      '/message/group/$groupId/cursor';
  static const conversations = '/message/conversations';
  static String markRead(String conversationId) =>
      '/message/read/$conversationId';
  static String recall(String messageId) => '/message/recall/$messageId';
  static String delete(String messageId) => '/message/delete/$messageId';
  static const config = '/message/config';
}

class FriendEndpoints {
  static const list = '/friend/list';
  static const request = '/friend/request';
  static const requests = '/friend/requests';
  static const accept = '/friend/accept';
  static const reject = '/friend/reject';
  static const remove = '/friend/remove';
  static const remark = '/friend/remark';
}

class GroupEndpoints {
  static const create = '/group/create';
  static String userGroups(String userId) => '/group/user/$userId';
  static const membersList = '/group/members/list';
  static String join(String groupId) => '/group/$groupId/join';
  static String addMembers(String groupId) => '/group/$groupId/add-members';
  static const search = '/group/search';
  static String leave(String groupId) => '/group/$groupId/leave';
  static String dismiss(String groupId) => '/group/$groupId';
  static String update(String groupId) => '/group/$groupId';
}

class MomentsEndpoints {
  static const create = '/moments';
  static const feed = '/moments/feed';
  static String postById(String postId) => '/moments/$postId';
  static String deletePost(String postId) => '/moments/$postId';
  static String addMedia(String postId) => '/moments/$postId/media';
  static String userPosts(String userId) => '/moments/user/$userId';
  static String like(String postId) => '/moments/$postId/like';
  static String unlike(String postId) => '/moments/$postId/like';
  static String likes(String postId) => '/moments/$postId/likes';
  static String createComment(String postId) => '/moments/$postId/comments';
  static String deleteComment(String commentId) =>
      '/moments/comments/$commentId';
  static String comments(String postId) => '/moments/$postId/comments';
  static const notifications = '/moments/notifications';
  static const markNotificationsRead = '/moments/notifications/read';
}

class FileEndpoints {
  static const uploadFile = '/file/upload/file';
  static const uploadImage = '/file/upload/image';
  static const uploadVideo = '/file/upload/video';
  static const uploadAudio = '/file/upload/audio';
  static const delete = '/file/delete';
}

class AiEndpoints {
  static const keys = '/ai/keys';
  static String keyById(String id) => '/ai/keys/$id';
  static String keyTest(String id) => '/ai/keys/$id/test';
  static const settings = '/ai/settings';
}

class PushEndpoints {
  static const registerDevice = '/push/devices/register';
  static const unregisterDevice = '/push/devices/unregister';
  static const updateDeviceToken = '/push/devices/token';
  static const settings = '/push/settings';
}

class AdminEndpoints {
  static const logs = '/admin/logs';
}

class E2eeEndpoints {
  static const bundle = '/api/keys/bundle';
  static String bundleByUser(String userId) => '/api/keys/bundle/$userId';
  static const request = '/api/e2ee/request';
  static const accept = '/api/e2ee/accept';
  static const reject = '/api/e2ee/reject';
  static const disable = '/api/e2ee/disable';
  static const heartbeat = '/api/keys/heartbeat';
  static const otkCount = '/api/keys/otk-count';
  static const otk = '/api/keys/otk';
}

class WsEndpoints {
  static const path = '/websocket';
  static const ticketParam = 'ticket';
}
