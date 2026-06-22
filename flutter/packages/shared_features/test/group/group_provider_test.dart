import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/group.dart';

import '../helpers/fakes.dart';

void main() {
  group('GroupNotifier', () {
    late FakeHttpClientPort http;
    late GroupNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      notifier = GroupNotifier(GroupApi(http));
    });

    test('joinGroup refreshes groups when userId is provided', () async {
      var getCount = 0;
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        getCount++;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {'id': 'g1', 'name': 'Group One'},
            ],
          }),
        );
      };

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1/join');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await notifier.loadGroups('u1');
      expect(notifier.state.groups, hasLength(1));

      final success = await notifier.joinGroup('g1', userId: 'u1');
      expect(success, isTrue);
      expect(getCount, 2);
      expect(notifier.state.error, isNull);
    });

    test('selectGroup exposes selected group', () {
      notifier.state = notifier.state.copyWith(
        groups: [
          const Group(id: 'g1', name: 'A'),
          const Group(id: 'g2', name: 'B'),
        ],
      );

      notifier.selectGroup('g2');
      expect(notifier.state.selectedGroupId, 'g2');
      expect(notifier.state.selectedGroup?.name, 'B');

      notifier.clearSelectedGroup();
      expect(notifier.state.selectedGroupId, isNull);
      expect(notifier.state.selectedGroup, isNull);
    });

    test('dismissGroup removes group from state', () async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      notifier.state = notifier.state.copyWith(
        groups: [const Group(id: 'g1', name: 'A')],
      );

      final success = await notifier.dismissGroup('g1');
      expect(success, isTrue);
      expect(notifier.state.groups, isEmpty);
      expect(notifier.state.error, isNull);
    });

    test('inviteMembers refreshes member list', () async {
      var postCount = 0;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        postCount++;
        if (postCount == 1) {
          expect(path, '/api/group/g1/add-members');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        }
        expect(path, GroupEndpoints.membersList);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'members': [
              {'id': 'm1', 'userId': 'u2', 'groupId': 'g1', 'role': 1},
            ],
          }),
        );
      };

      final success = await notifier.inviteMembers('g1', ['u2']);
      expect(success, isTrue);
      expect(notifier.state.membersByGroupId['g1'], hasLength(1));
      expect(notifier.state.error, isNull);
    });

    test('removeMembers updates local member list', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1/remove-members');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      notifier.state = notifier.state.copyWith(
        membersByGroupId: {
          'g1': [
            const GroupMember(id: 'm1', userId: 'u1', groupId: 'g1', role: '3'),
            const GroupMember(id: 'm2', userId: 'u2', groupId: 'g1', role: '1'),
          ],
        },
      );

      final success = await notifier.removeMembers('g1', ['u2']);
      expect(success, isTrue);
      expect(notifier.state.membersByGroupId['g1'], hasLength(1));
      expect(notifier.state.membersByGroupId['g1']!.first.userId, 'u1');
      expect(notifier.state.error, isNull);
    });
  });
}
