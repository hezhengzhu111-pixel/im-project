import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('AuthEndpoints', () {
    test('parse path is correct', () {
      expect(AuthEndpoints.parse, '/auth/parse');
    });

    test('refresh path is correct', () {
      expect(AuthEndpoints.refresh, '/auth/refresh');
    });

    test('wsTicket path is correct', () {
      expect(AuthEndpoints.wsTicket, '/auth/ws-ticket');
    });
  });

  group('UserEndpoints', () {
    test('static paths are correct', () {
      expect(UserEndpoints.login, '/user/login');
      expect(UserEndpoints.register, '/user/register');
      expect(UserEndpoints.profile, '/user/profile');
      expect(UserEndpoints.search, '/user/search');
      expect(UserEndpoints.logout, '/user/logout');
      expect(UserEndpoints.heartbeat, '/user/heartbeat');
      expect(UserEndpoints.onlineStatus, '/user/online-status');
      expect(UserEndpoints.password, '/user/password');
      expect(UserEndpoints.phoneCode, '/user/phone/code');
      expect(UserEndpoints.phoneBind, '/user/phone/bind');
      expect(UserEndpoints.emailCode, '/user/email/code');
      expect(UserEndpoints.emailBind, '/user/email/bind');
      expect(UserEndpoints.account, '/user/account');
      expect(UserEndpoints.settings, '/user/settings');
    });

    test('settingsType returns parameterized path', () {
      expect(UserEndpoints.settingsType('general'), '/user/settings/general');
      expect(UserEndpoints.settingsType('privacy'), '/user/settings/privacy');
      expect(UserEndpoints.settingsType('notification'),
          '/user/settings/notification');
    });
  });

  group('MessageEndpoints', () {
    test('static paths are correct', () {
      expect(MessageEndpoints.sendPrivate, '/message/send/private');
      expect(MessageEndpoints.sendGroup, '/message/send/group');
      expect(MessageEndpoints.conversations, '/message/conversations');
      expect(MessageEndpoints.config, '/message/config');
    });

    test('privateHistory returns parameterized path', () {
      expect(MessageEndpoints.privateHistory('123'), '/message/private/123');
      expect(MessageEndpoints.privateHistory('friend-abc'),
          '/message/private/friend-abc');
    });

    test('privateHistoryCursor returns parameterized path', () {
      expect(MessageEndpoints.privateHistoryCursor('f1'),
          '/message/private/f1/cursor');
    });

    test('groupHistory returns parameterized path', () {
      expect(MessageEndpoints.groupHistory('g1'), '/message/group/g1');
    });

    test('groupHistoryCursor returns parameterized path', () {
      expect(MessageEndpoints.groupHistoryCursor('g1'),
          '/message/group/g1/cursor');
    });

    test('markRead returns parameterized path', () {
      expect(MessageEndpoints.markRead('conv1'), '/message/read/conv1');
    });

    test('recall returns parameterized path', () {
      expect(MessageEndpoints.recall('msg1'), '/message/recall/msg1');
    });

    test('delete returns parameterized path', () {
      expect(MessageEndpoints.delete('msg1'), '/message/delete/msg1');
    });
  });

  group('FriendEndpoints', () {
    test('all paths are correct', () {
      expect(FriendEndpoints.list, '/friend/list');
      expect(FriendEndpoints.request, '/friend/request');
      expect(FriendEndpoints.requests, '/friend/requests');
      expect(FriendEndpoints.accept, '/friend/accept');
      expect(FriendEndpoints.reject, '/friend/reject');
      expect(FriendEndpoints.remove, '/friend/remove');
      expect(FriendEndpoints.remark, '/friend/remark');
    });
  });

  group('GroupEndpoints', () {
    test('static paths are correct', () {
      expect(GroupEndpoints.create, '/group/create');
      expect(GroupEndpoints.membersList, '/group/members/list');
      expect(GroupEndpoints.search, '/group/search');
    });

    test('userGroups returns parameterized path', () {
      expect(GroupEndpoints.userGroups('u1'), '/group/user/u1');
    });

    test('join returns parameterized path', () {
      expect(GroupEndpoints.join('g1'), '/group/g1/join');
    });

    test('addMembers returns parameterized path', () {
      expect(GroupEndpoints.addMembers('g1'), '/group/g1/add-members');
    });

    test('leave returns parameterized path', () {
      expect(GroupEndpoints.leave('g1'), '/group/g1/leave');
    });

    test('dismiss returns parameterized path', () {
      expect(GroupEndpoints.dismiss('g1'), '/group/g1');
    });

    test('update returns parameterized path', () {
      expect(GroupEndpoints.update('g1'), '/group/g1');
    });
  });

  group('MomentsEndpoints', () {
    test('static paths are correct', () {
      expect(MomentsEndpoints.create, '/moments');
      expect(MomentsEndpoints.feed, '/moments/feed');
      expect(MomentsEndpoints.notifications, '/moments/notifications');
      expect(MomentsEndpoints.markNotificationsRead,
          '/moments/notifications/read');
    });

    test('postById returns parameterized path', () {
      expect(MomentsEndpoints.postById('p1'), '/moments/p1');
    });

    test('deletePost returns parameterized path', () {
      expect(MomentsEndpoints.deletePost('p1'), '/moments/p1');
    });

    test('addMedia returns parameterized path', () {
      expect(MomentsEndpoints.addMedia('p1'), '/moments/p1/media');
    });

    test('userPosts returns parameterized path', () {
      expect(MomentsEndpoints.userPosts('u1'), '/moments/user/u1');
    });

    test('like returns parameterized path', () {
      expect(MomentsEndpoints.like('p1'), '/moments/p1/like');
    });

    test('unlike returns parameterized path', () {
      expect(MomentsEndpoints.unlike('p1'), '/moments/p1/like');
    });

    test('likes returns parameterized path', () {
      expect(MomentsEndpoints.likes('p1'), '/moments/p1/likes');
    });

    test('createComment returns parameterized path', () {
      expect(MomentsEndpoints.createComment('p1'), '/moments/p1/comments');
    });

    test('deleteComment returns parameterized path', () {
      expect(MomentsEndpoints.deleteComment('c1'), '/moments/comments/c1');
    });

    test('comments returns parameterized path', () {
      expect(MomentsEndpoints.comments('p1'), '/moments/p1/comments');
    });
  });

  group('FileEndpoints', () {
    test('all paths are correct', () {
      expect(FileEndpoints.uploadFile, '/file/upload/file');
      expect(FileEndpoints.uploadImage, '/file/upload/image');
      expect(FileEndpoints.uploadVideo, '/file/upload/video');
      expect(FileEndpoints.uploadAudio, '/file/upload/audio');
      expect(FileEndpoints.delete, '/file/delete');
    });
  });

  group('AiEndpoints', () {
    test('static paths are correct', () {
      expect(AiEndpoints.keys, '/ai/keys');
      expect(AiEndpoints.settings, '/ai/settings');
    });

    test('keyById returns parameterized path', () {
      expect(AiEndpoints.keyById('k1'), '/ai/keys/k1');
    });

    test('keyTest returns parameterized path', () {
      expect(AiEndpoints.keyTest('k1'), '/ai/keys/k1/test');
    });
  });

  group('PushEndpoints', () {
    test('all paths are correct', () {
      expect(PushEndpoints.registerDevice, '/push/devices/register');
      expect(PushEndpoints.unregisterDevice, '/push/devices/unregister');
      expect(PushEndpoints.updateDeviceToken, '/push/devices/token');
      expect(PushEndpoints.settings, '/push/settings');
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
}
