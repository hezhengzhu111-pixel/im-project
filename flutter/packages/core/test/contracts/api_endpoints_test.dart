import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('AuthEndpoints', () {
    test('parse path is correct', () {
      expect(AuthEndpoints.parse, '/api/auth/parse');
    });

    test('refresh path is correct', () {
      expect(AuthEndpoints.refresh, '/api/auth/refresh');
    });

    test('wsTicket path is correct', () {
      expect(AuthEndpoints.wsTicket, '/api/auth/ws-ticket');
    });
  });

  group('UserEndpoints', () {
    test('static paths are correct', () {
      expect(UserEndpoints.login, '/api/user/login');
      expect(UserEndpoints.register, '/api/user/register');
      expect(UserEndpoints.profile, '/api/user/profile');
      expect(UserEndpoints.search, '/api/user/search');
      expect(UserEndpoints.logout, '/api/user/logout');
      expect(UserEndpoints.heartbeat, '/api/user/heartbeat');
      expect(UserEndpoints.onlineStatus, '/api/user/online-status');
      expect(UserEndpoints.password, '/api/user/password');
      expect(UserEndpoints.phoneCode, '/api/user/phone/code');
      expect(UserEndpoints.phoneBind, '/api/user/phone/bind');
      expect(UserEndpoints.emailCode, '/api/user/email/code');
      expect(UserEndpoints.emailBind, '/api/user/email/bind');
      expect(UserEndpoints.account, '/api/user/account');
      expect(UserEndpoints.settings, '/api/user/settings');
      expect(UserEndpoints.offline, '/api/user/offline');
    });

    test('settingsType returns parameterized path', () {
      expect(UserEndpoints.settingsType('general'), '/api/user/settings/general');
      expect(UserEndpoints.settingsType('privacy'), '/api/user/settings/privacy');
      expect(UserEndpoints.settingsType('notification'),
          '/api/user/settings/notification');
    });
  });

  group('MessageEndpoints', () {
    test('static paths are correct', () {
      expect(MessageEndpoints.sendPrivate, '/api/message/send/private');
      expect(MessageEndpoints.sendGroup, '/api/message/send/group');
      expect(MessageEndpoints.conversations, '/api/message/conversations');
      expect(MessageEndpoints.config, '/api/message/config');
    });

    test('privateHistory returns parameterized path', () {
      expect(MessageEndpoints.privateHistory('123'), '/api/message/private/123');
      expect(MessageEndpoints.privateHistory('friend-abc'),
          '/api/message/private/friend-abc');
    });

    test('privateHistoryCursor returns parameterized path', () {
      expect(MessageEndpoints.privateHistoryCursor('f1'),
          '/api/message/private/f1/cursor');
    });

    test('groupHistory returns parameterized path', () {
      expect(MessageEndpoints.groupHistory('g1'), '/api/message/group/g1');
    });

    test('groupHistoryCursor returns parameterized path', () {
      expect(MessageEndpoints.groupHistoryCursor('g1'),
          '/api/message/group/g1/cursor');
    });

    test('markRead returns parameterized path', () {
      expect(MessageEndpoints.markRead('conv1'), '/api/message/read/conv1');
    });

    test('recall returns parameterized path', () {
      expect(MessageEndpoints.recall('msg1'), '/api/message/recall/msg1');
    });

    test('delete returns parameterized path', () {
      expect(MessageEndpoints.delete('msg1'), '/api/message/delete/msg1');
    });
  });

  group('FriendEndpoints', () {
    test('all paths are correct', () {
      expect(FriendEndpoints.list, '/api/friend/list');
      expect(FriendEndpoints.request, '/api/friend/request');
      expect(FriendEndpoints.requests, '/api/friend/requests');
      expect(FriendEndpoints.accept, '/api/friend/accept');
      expect(FriendEndpoints.reject, '/api/friend/reject');
      expect(FriendEndpoints.remove, '/api/friend/remove');
      expect(FriendEndpoints.remark, '/api/friend/remark');
    });
  });

  group('GroupEndpoints', () {
    test('static paths are correct', () {
      expect(GroupEndpoints.create, '/api/group/create');
      expect(GroupEndpoints.membersList, '/api/group/members/list');
      expect(GroupEndpoints.search, '/api/group/search');
    });

    test('userGroups returns parameterized path', () {
      expect(GroupEndpoints.userGroups('u1'), '/api/group/user/u1');
    });

    test('join returns parameterized path', () {
      expect(GroupEndpoints.join('g1'), '/api/group/g1/join');
    });

    test('addMembers returns parameterized path', () {
      expect(GroupEndpoints.addMembers('g1'), '/api/group/g1/add-members');
    });

    test('leave returns parameterized path', () {
      expect(GroupEndpoints.leave('g1'), '/api/group/g1/leave');
    });

    test('dismiss returns parameterized path', () {
      expect(GroupEndpoints.dismiss('g1'), '/api/group/g1');
    });

    test('update returns parameterized path', () {
      expect(GroupEndpoints.update('g1'), '/api/group/g1');
    });
  });

  group('MomentsEndpoints', () {
    test('static paths are correct', () {
      expect(MomentsEndpoints.create, '/api/moments');
      expect(MomentsEndpoints.feed, '/api/moments/feed');
      expect(MomentsEndpoints.notifications, '/api/moments/notifications');
      expect(MomentsEndpoints.markNotificationsRead,
          '/api/moments/notifications/read');
    });

    test('postById returns parameterized path', () {
      expect(MomentsEndpoints.postById('p1'), '/api/moments/p1');
    });

    test('deletePost returns parameterized path', () {
      expect(MomentsEndpoints.deletePost('p1'), '/api/moments/p1');
    });

    test('addMedia returns parameterized path', () {
      expect(MomentsEndpoints.addMedia('p1'), '/api/moments/p1/media');
    });

    test('userPosts returns parameterized path', () {
      expect(MomentsEndpoints.userPosts('u1'), '/api/moments/user/u1');
    });

    test('like returns parameterized path', () {
      expect(MomentsEndpoints.like('p1'), '/api/moments/p1/like');
    });

    test('unlike returns parameterized path', () {
      expect(MomentsEndpoints.unlike('p1'), '/api/moments/p1/like');
    });

    test('likes returns parameterized path', () {
      expect(MomentsEndpoints.likes('p1'), '/api/moments/p1/likes');
    });

    test('createComment returns parameterized path', () {
      expect(MomentsEndpoints.createComment('p1'), '/api/moments/p1/comments');
    });

    test('deleteComment returns parameterized path', () {
      expect(MomentsEndpoints.deleteComment('c1'), '/api/moments/comments/c1');
    });

    test('comments returns parameterized path', () {
      expect(MomentsEndpoints.comments('p1'), '/api/moments/p1/comments');
    });
  });

  group('FileEndpoints', () {
    test('all paths are correct', () {
      expect(FileEndpoints.uploadImage, '/api/file/upload/image');
      expect(FileEndpoints.uploadFile, '/api/file/upload/file');
      expect(FileEndpoints.uploadVideo, '/api/file/upload/video');
      expect(FileEndpoints.uploadAudio, '/api/file/upload/audio');
      expect(FileEndpoints.uploadAvatar, '/api/file/upload/avatar');
      expect(FileEndpoints.download, '/api/file/download');
      expect(FileEndpoints.info, '/api/file/info');
      expect(FileEndpoints.delete, '/api/file/delete');
    });
  });

  group('AiEndpoints', () {
    test('static paths are correct', () {
      expect(AiEndpoints.keys, '/api/ai/keys');
      expect(AiEndpoints.settings, '/api/ai/settings');
      expect(AiEndpoints.summary, '/api/ai/summary');
      expect(AiEndpoints.ragDocs, '/api/ai/rag/docs');
      expect(AiEndpoints.ragQuery, '/api/ai/rag/query');
    });

    test('keyById returns parameterized path', () {
      expect(AiEndpoints.keyById('k1'), '/api/ai/keys/k1');
    });

    test('keyTest returns parameterized path', () {
      expect(AiEndpoints.keyTest('k1'), '/api/ai/keys/k1/test');
    });

    test('stream returns parameterized path', () {
      expect(AiEndpoints.stream('task-1'), '/api/ai/stream/task-1');
    });

    test('ragDocById returns parameterized path', () {
      expect(AiEndpoints.ragDocById('doc1'), '/api/ai/rag/docs/doc1');
    });
  });

  group('PushEndpoints', () {
    test('all paths are correct', () {
      expect(PushEndpoints.registerDevice, '/api/push/devices/register');
      expect(PushEndpoints.unregisterDevice, '/api/push/devices/unregister');
      expect(PushEndpoints.updateDeviceToken, '/api/push/devices/token');
      expect(PushEndpoints.settings, '/api/push/settings');
    });
  });

  group('E2eeEndpoints', () {
    test('key management paths are correct', () {
      expect(E2eeEndpoints.bundle, '/api/keys/bundle');
      expect(E2eeEndpoints.devices, '/api/keys/devices');
      expect(E2eeEndpoints.heartbeat, '/api/keys/heartbeat');
      expect(E2eeEndpoints.opkStatus, '/api/keys/opk/status');
      expect(E2eeEndpoints.opkRefill, '/api/keys/opk/refill');
      expect(E2eeEndpoints.opkExpired, '/api/keys/opk/expired');
      expect(E2eeEndpoints.otkCount, '/api/keys/otk-count');
      expect(E2eeEndpoints.otk, '/api/keys/otk');
      expect(E2eeEndpoints.salt, '/api/keys/salt');
      expect(E2eeEndpoints.backup, '/api/keys/backup');
    });

    test('deleteDevice returns parameterized path', () {
      expect(E2eeEndpoints.deleteDevice('dev-1'), '/api/keys/device/dev-1');
    });

    test('session management paths are correct', () {
      expect(E2eeEndpoints.createSession, '/api/e2ee/sessions');
      expect(E2eeEndpoints.request, '/api/e2ee/request');
      expect(E2eeEndpoints.accept, '/api/e2ee/accept');
      expect(E2eeEndpoints.reject, '/api/e2ee/reject');
      expect(E2eeEndpoints.disable, '/api/e2ee/disable');
      expect(E2eeEndpoints.pending, '/api/e2ee/pending');
    });

    test('status returns parameterized path', () {
      expect(E2eeEndpoints.status('s1'), '/api/e2ee/status/s1');
    });

    test('conversation session paths are correct', () {
      expect(E2eeEndpoints.conversationSession('conv1'),
          '/api/e2ee/conversations/conv1/session');
      expect(E2eeEndpoints.rotateConversationSession('conv1'),
          '/api/e2ee/conversations/conv1/rotate');
    });

    test('devicesByUser returns parameterized path', () {
      expect(E2eeEndpoints.devicesByUser('u1'), '/api/e2ee/devices/u1');
    });

    test('group e2ee paths are correct', () {
      expect(E2eeEndpoints.groupEnable('g1'), '/api/e2ee/groups/g1/enable');
      expect(E2eeEndpoints.groupDisable('g1'), '/api/e2ee/groups/g1/disable');
      expect(E2eeEndpoints.groupSenderKey('g1'),
          '/api/e2ee/groups/g1/sender-key');
      expect(E2eeEndpoints.groupSenderKeys('g1'),
          '/api/e2ee/groups/g1/sender-keys');
      expect(E2eeEndpoints.groupRemoveSenderKey('g1', 'u1'),
          '/api/e2ee/groups/g1/sender-keys/u1');
      expect(E2eeEndpoints.groupStatus('g1'), '/api/e2ee/groups/g1/status');
      expect(E2eeEndpoints.groupDevices('g1'), '/api/e2ee/groups/g1/devices');
    });
  });

  group('AdminEndpoints', () {
    test('logs path is correct', () {
      expect(AdminEndpoints.logs, '/admin/logs');
    });
  });

  group('WsEndpoints', () {
    test('path is correct', () {
      expect(WsEndpoints.path, '/websocket');
    });

    test('ticketParam is correct', () {
      expect(WsEndpoints.ticketParam, 'ticket');
    });
  });

  group('ApiCodes', () {
    test('status codes are correct', () {
      expect(ApiCodes.ok, 200);
      expect(ApiCodes.badRequest, 400);
      expect(ApiCodes.unauthorized, 401);
      expect(ApiCodes.forbidden, 403);
      expect(ApiCodes.notFound, 404);
      expect(ApiCodes.internalError, 500);
    });
  });

  group('WsMessageType', () {
    test('all message types are correct', () {
      expect(WsMessageType.message, 'MESSAGE');
      expect(WsMessageType.messageStatusChanged, 'MESSAGE_STATUS_CHANGED');
      expect(WsMessageType.heartbeat, 'HEARTBEAT');
      expect(WsMessageType.onlineStatus, 'ONLINE_STATUS');
      expect(WsMessageType.readReceipt, 'READ_RECEIPT');
      expect(WsMessageType.readSync, 'READ_SYNC');
      expect(WsMessageType.system, 'SYSTEM');
      expect(WsMessageType.friendRequest, 'FRIEND_REQUEST');
      expect(WsMessageType.friendAccepted, 'FRIEND_ACCEPTED');
      expect(WsMessageType.e2eeNegotiation, 'E2EE_NEGOTIATION');
    });
  });

  group('Endpoint contract - all REST paths start with /api/', () {
    test('AuthEndpoints', () {
      expect(AuthEndpoints.parse.startsWith('/api/'), isTrue);
      expect(AuthEndpoints.refresh.startsWith('/api/'), isTrue);
      expect(AuthEndpoints.wsTicket.startsWith('/api/'), isTrue);
    });

    test('UserEndpoints', () {
      expect(UserEndpoints.login.startsWith('/api/'), isTrue);
      expect(UserEndpoints.register.startsWith('/api/'), isTrue);
      expect(UserEndpoints.profile.startsWith('/api/'), isTrue);
      expect(UserEndpoints.settings.startsWith('/api/'), isTrue);
      expect(UserEndpoints.settingsType('x').startsWith('/api/'), isTrue);
      expect(UserEndpoints.offline.startsWith('/api/'), isTrue);
    });

    test('MessageEndpoints', () {
      expect(MessageEndpoints.sendPrivate.startsWith('/api/'), isTrue);
      expect(MessageEndpoints.sendGroup.startsWith('/api/'), isTrue);
      expect(MessageEndpoints.config.startsWith('/api/'), isTrue);
      expect(MessageEndpoints.privateHistory('1').startsWith('/api/'), isTrue);
      expect(MessageEndpoints.groupHistory('1').startsWith('/api/'), isTrue);
    });

    test('FriendEndpoints', () {
      expect(FriendEndpoints.list.startsWith('/api/'), isTrue);
      expect(FriendEndpoints.request.startsWith('/api/'), isTrue);
    });

    test('GroupEndpoints', () {
      expect(GroupEndpoints.create.startsWith('/api/'), isTrue);
      expect(GroupEndpoints.search.startsWith('/api/'), isTrue);
      expect(GroupEndpoints.join('1').startsWith('/api/'), isTrue);
    });

    test('MomentsEndpoints', () {
      expect(MomentsEndpoints.create.startsWith('/api/'), isTrue);
      expect(MomentsEndpoints.feed.startsWith('/api/'), isTrue);
      expect(MomentsEndpoints.postById('1').startsWith('/api/'), isTrue);
    });

    test('FileEndpoints', () {
      expect(FileEndpoints.uploadImage.startsWith('/api/'), isTrue);
      expect(FileEndpoints.uploadFile.startsWith('/api/'), isTrue);
      expect(FileEndpoints.uploadAvatar.startsWith('/api/'), isTrue);
      expect(FileEndpoints.download.startsWith('/api/'), isTrue);
      expect(FileEndpoints.info.startsWith('/api/'), isTrue);
      expect(FileEndpoints.delete.startsWith('/api/'), isTrue);
    });

    test('PushEndpoints', () {
      expect(PushEndpoints.registerDevice.startsWith('/api/'), isTrue);
      expect(PushEndpoints.settings.startsWith('/api/'), isTrue);
    });

    test('AiEndpoints', () {
      expect(AiEndpoints.keys.startsWith('/api/'), isTrue);
      expect(AiEndpoints.settings.startsWith('/api/'), isTrue);
      expect(AiEndpoints.summary.startsWith('/api/'), isTrue);
      expect(AiEndpoints.stream('t1').startsWith('/api/'), isTrue);
      expect(AiEndpoints.ragDocs.startsWith('/api/'), isTrue);
      expect(AiEndpoints.ragDocById('d1').startsWith('/api/'), isTrue);
      expect(AiEndpoints.ragQuery.startsWith('/api/'), isTrue);
    });

    test('E2eeEndpoints', () {
      expect(E2eeEndpoints.bundle.startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.salt.startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.backup.startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.deleteDevice('d1').startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.createSession.startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.conversationSession('c1').startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.groupEnable('g1').startsWith('/api/'), isTrue);
      expect(E2eeEndpoints.groupDevices('g1').startsWith('/api/'), isTrue);
    });

    test('WsEndpoints is the only exception', () {
      expect(WsEndpoints.path, '/websocket');
      expect(WsEndpoints.path.startsWith('/api/'), isFalse);
    });
  });
}
