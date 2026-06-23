import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/group.dart';

import '../helpers/fakes.dart';

void main() {
  group('GroupApi', () {
    late FakeHttpClientPort http;
    late GroupApi api;

    setUp(() {
      http = FakeHttpClientPort();
      api = GroupApi(http);
    });

    test('createGroup uses POST /api/group/create', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.create);
        expect(body['name'], 'Test Group');
        expect(body['memberIds'], ['u1', 'u2']);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'g1',
            'name': 'Test Group',
            'ownerId': 'u1',
          }),
        );
      };

      final result = await api.createGroup(
        name: 'Test Group',
        memberIds: ['u1', 'u2'],
      );
      expect(result.id, 'g1');
      expect(result.name, 'Test Group');
    });

    test('getUserGroups uses GET /api/group/user/:userId', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/user/u1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {'id': 'g1', 'name': 'Group 1'},
            ],
          }),
        );
      };

      final result = await api.getUserGroups('u1');
      expect(result, hasLength(1));
    });

    test('getMembers uses POST /api/group/members/list', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.membersList);
        expect(body, {'groupId': 'g1'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'members': [
              {'id': 'm1', 'userId': 'u1', 'groupId': 'g1'},
            ],
          }),
        );
      };

      final result = await api.getMembers('g1');
      expect(result, hasLength(1));
    });

    test('joinGroup uses POST /api/group/:groupId/join', () async {
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

      await api.joinGroup('g1');
      expect(http.requests.last.$2, '/api/group/g1/join');
    });

    test('leaveGroup uses POST /api/group/:groupId/leave', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1/leave');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.leaveGroup('g1');
      expect(http.requests.last.$2, '/api/group/g1/leave');
    });

    test('searchGroups uses GET /api/group/search', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, GroupEndpoints.search);
        expect(queryParameters, {'q': 'test'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {'id': 'g1', 'name': 'Test Group'},
            ],
          }),
        );
      };

      final result = await api.searchGroups('test');
      expect(result, hasLength(1));
    });

    test('addMembers uses POST /api/group/:groupId/add-members', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1/add-members');
        expect(body, {
          'groupId': 'g1',
          'memberIds': ['u3', 'u4'],
        });
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.addMembers('g1', ['u3', 'u4']);
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, '/api/group/g1/add-members');
    });

    test('removeMembers uses POST /api/group/:groupId/remove-members', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1/remove-members');
        expect(body, {
          'groupId': 'g1',
          'memberIds': ['u3'],
        });
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.removeMembers('g1', ['u3']);
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, '/api/group/g1/remove-members');
    });

    test('updateGroup uses PUT /api/group/:groupId', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1');
        expect(body, {'name': 'New Name'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'id': 'g1', 'name': 'New Name'}),
        );
      };

      final result = await api.updateGroup('g1', name: 'New Name');
      expect(result.name, 'New Name');
      expect(http.requests.last.$1, 'PUT');
    });

    test('dismissGroup uses DELETE /api/group/:groupId', () async {
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

      await api.dismissGroup('g1');
      expect(http.requests.last.$1, 'DELETE');
      expect(http.requests.last.$2, '/api/group/g1');
    });

    test('API errors propagate', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Server error');
      };

      expect(
        () => api.addMembers('g1', ['u1']),
        throwsA(isA<Exception>()),
      );
    });
  });
}
