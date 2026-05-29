import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/contacts/data/contacts_api.dart';
import 'package:im_web/features/contacts/presentation/contacts_provider.dart';

import '../../helpers/fakes.dart';

void main() {
  group('ContactsNotifier', () {
    late FakeHttpClientPort http;
    late FakeWsClientPort ws;
    late ContactsNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      ws = FakeWsClientPort();
      notifier = ContactsNotifier(ContactsApi(http), ws);
    });

    tearDown(() {
      notifier.dispose();
      ws.dispose();
    });

    test('sendFriendRequest marks request and refreshes request list',
        () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FriendEndpoints.request);
        expect(body, {
          'targetUserId': 'user-2',
          'reason': 'hello',
        });
        return ApiResponse(code: 200, message: 'ok', data: fromJson({}));
      };

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FriendEndpoints.requests);
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'req-1',
                'applicantId': 'current-user',
                'applicantUsername': 'me',
                'targetUserId': 'user-2',
                'targetUsername': 'alice',
                'reason': 'hello',
                'status': 'PENDING',
                'createTime': '2026-05-29T00:00:00Z',
              },
            ],
          }),
        );
      };

      await notifier.sendFriendRequest('user-2', reason: 'hello');

      expect(notifier.state.sentRequestUserIds, contains('user-2'));
      expect(notifier.state.friendRequests, hasLength(1));
      expect(notifier.state.friendRequests.single.targetUserId, 'user-2');
      expect(
        http.requests.map((request) => '${request.$1} ${request.$2}'),
        ['POST ${FriendEndpoints.request}', 'GET ${FriendEndpoints.requests}'],
      );
    });

    test('acceptRequest reloads friends and requests', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          expect(body, ['user-2']);
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({'user-2': true}),
          );
        }
        expect(path, FriendEndpoints.accept);
        expect(body, {'requestId': 'req-1'});
        return ApiResponse(code: 200, message: 'ok', data: fromJson({}));
      };

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'friendship-1',
                  'friendId': 'user-2',
                  'username': 'alice',
                  'nickname': 'Alice',
                  'createdAt': '2026-05-29T00:00:00Z',
                  'createTime': '2026-05-29T00:00:00Z',
                },
              ],
            }),
          );
        }

        expect(path, FriendEndpoints.requests);
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'req-1',
                'applicantId': 'user-2',
                'applicantUsername': 'alice',
                'targetUserId': 'current-user',
                'targetUsername': 'me',
                'status': 'ACCEPTED',
                'createTime': '2026-05-29T00:00:00Z',
              },
            ],
          }),
        );
      };

      final accepted = await notifier.acceptRequest('req-1');

      expect(accepted, isTrue);
      expect(notifier.state.friends, hasLength(1));
      expect(notifier.state.friends.single.friendId, 'user-2');
      expect(notifier.state.friends.single.isOnline, isTrue);
      expect(notifier.state.friendRequests.single.status, 'ACCEPTED');
    });

    test('updates friend online status from websocket presence event',
        () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'friendship-1',
                  'friendId': 'user-2',
                  'username': 'alice',
                  'createdAt': '2026-05-29T00:00:00Z',
                  'createTime': '2026-05-29T00:00:00Z',
                },
              ],
            }),
          );
        }
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({'items': []}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, UserEndpoints.onlineStatus);
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({'user-2': false}),
        );
      };

      await notifier.loadFriends();
      ws.addEvent(FakeWsEvent(
        type: WsMessageType.onlineStatus,
        data: {'userId': 'user-2', 'status': 'ONLINE'},
      ));
      await Future<void>.delayed(Duration.zero);

      expect(notifier.state.friends.single.isOnline, isTrue);
    });

    test('system friend refresh message reloads friends and requests',
        () async {
      var listCalls = 0;
      var requestCalls = 0;
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          listCalls++;
        } else if (path == FriendEndpoints.requests) {
          requestCalls++;
        }
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({'items': []}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        }
        throw UnimplementedError('Unexpected POST $path');
      };

      ws.addEvent(FakeWsEvent(
        type: WsMessageType.message,
        data: {
          'messageType': 'SYSTEM',
          'content': '新好友申请::CMD:REFRESH_FRIEND_REQUESTS',
        },
      ));
      await Future<void>.delayed(Duration.zero);

      expect(listCalls, 1);
      expect(requestCalls, 1);
    });
  });
}
