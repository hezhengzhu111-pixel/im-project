import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/contacts/data/contacts_api.dart';
import 'package:im_web/features/group/data/group_api.dart';

import '../../helpers/fakes.dart';

void main() {
  group('ContactsApi data boundary', () {
    test('sendFriendRequest includes verification reason', () async {
      final http = FakeHttpClientPort();
      final api = ContactsApi(http);

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse(code: 200, message: 'ok', data: fromJson({}));
      };

      await api.sendFriendRequest('user-2', reason: 'please add me');

      expect(http.requests.single.$1, 'POST');
      expect(http.requests.single.$2, FriendEndpoints.request);
      expect(http.requests.single.$3, {
        'targetUserId': 'user-2',
        'reason': 'please add me',
      });
    });

    test('deleteFriend uses friendUserId query parameter', () async {
      final http = FakeHttpClientPort();
      final api = ContactsApi(http);

      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(queryParameters, {'friendUserId': 'user-2'});
        return ApiResponse(code: 200, message: 'ok', data: fromJson({}));
      };

      await api.deleteFriend('user-2');

      expect(http.requests.single.$1, 'DELETE');
      expect(http.requests.single.$2, FriendEndpoints.remove);
    });

    test('updateFriendRemark sends remark as query parameters', () async {
      final http = FakeHttpClientPort();
      final api = ContactsApi(http);

      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, contains(FriendEndpoints.remark));
        expect(path, contains('friendUserId=user-2'));
        expect(path, contains('remark=teammate'));
        return ApiResponse(code: 200, message: 'ok', data: fromJson({}));
      };

      await api.updateFriendRemark('user-2', 'teammate');
    });
  });

  group('GroupApi data boundary', () {
    test('createGroup includes avatar', () async {
      final http = FakeHttpClientPort();
      final api = GroupApi(http);

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.create);
        expect(body['avatar'], 'https://example.com/avatar.png');
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'group-1',
            'name': body['name'],
            'avatar': body['avatar'],
            'memberCount': 2,
          }),
        );
      };

      final group = await api.createGroup(
        name: 'Team',
        avatar: 'https://example.com/avatar.png',
        memberIds: ['user-2'],
      );

      expect(group.avatar, 'https://example.com/avatar.png');
    });

    test('searchGroups uses q query parameter', () async {
      final http = FakeHttpClientPort();
      final api = GroupApi(http);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.search);
        expect(queryParameters, {'q': 'team'});
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {'id': 'group-1', 'name': 'Team'},
            ],
          }),
        );
      };

      final groups = await api.searchGroups('team');

      expect(groups.single.id, 'group-1');
    });

    test('getMembers parses backend members wrapper', () async {
      final http = FakeHttpClientPort();
      final api = GroupApi(http);

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.membersList);
        expect(body, {'groupId': 'group-1'});
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'members': [
              {
                'id': 'member-1',
                'userId': 'user-1',
                'groupId': 'group-1',
              },
            ],
          }),
        );
      };

      final members = await api.getMembers('group-1');

      expect(members.single.userId, 'user-1');
    });
  });
}
