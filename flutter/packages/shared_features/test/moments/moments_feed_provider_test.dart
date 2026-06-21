import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/moments.dart';
import '../helpers/fakes.dart';

Map<String, dynamic> _postJson(String id, {String? content}) {
  return {
    'post': {
      'id': id,
      'userId': 'u1',
      'createdAt': DateTime.now().toIso8601String(),
      'content': content ?? 'Post $id',
    },
    'isLiked': false,
    'likeCount': 0,
    'commentCount': 0,
    'userNickname': 'User',
  };
}

MomentsFeedNotifier _createNotifier(FakeHttpClientPort http) {
  final api = MomentsApi(http);
  final repository = MomentsRepository(api, FileApi(http, FakeAnalyticsPort()));
  return MomentsFeedNotifier(repository);
}

void main() {
  group('MomentsFeedNotifier', () {
    test('append deduplicates posts by id', () async {
      final http = FakeHttpClientPort();
      final notifier = _createNotifier(http);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          final cursor = queryParameters?['cursor'] as String?;
          final items = cursor == null
              ? List.generate(20, (i) => _postJson('p$i'))
              : [_postJson('p19'), _postJson('p20')];
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': items}),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await notifier.loadFeed();
      expect(notifier.state.posts.length, 20);

      await notifier.loadFeed();
      expect(
        notifier.state.posts.map((p) => p.post.id),
        [...List.generate(20, (i) => 'p$i'), 'p20'],
        reason: 'p19 must not be duplicated when returned again as cursor',
      );
    });

    test('delete failure keeps the post and exposes error', () async {
      final http = FakeHttpClientPort();
      final notifier = _createNotifier(http);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [_postJson('p1'), _postJson('p2')],
            }),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('delete failed');
      };

      await notifier.loadFeed();
      expect(notifier.state.posts.map((p) => p.post.id), ['p1', 'p2']);

      await notifier.removePost('p1');
      expect(notifier.state.posts.map((p) => p.post.id), ['p1', 'p2']);
      expect(notifier.state.error, isNotNull);
      expect(notifier.state.deletingPostIds, isEmpty);
    });

    test('rapid like taps are debounced to a single server call', () async {
      final http = FakeHttpClientPort();
      final notifier = _createNotifier(http);
      final calls = <String>[];

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [_postJson('p1')]
            }),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        calls.add(path);
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      await notifier.loadFeed();
      expect(notifier.state.posts.first.isLiked, isFalse);

      final future1 = notifier.toggleLike('p1');
      expect(notifier.state.pendingLikePostIds, contains('p1'));
      expect(notifier.state.posts.first.isLiked, isTrue);

      // Second tap while the first request is in-flight must be ignored.
      final future2 = notifier.toggleLike('p1');
      expect(notifier.state.pendingLikePostIds, contains('p1'));

      await Future.wait([future1, future2]);
      expect(
          calls.where((p) => p == MomentsEndpoints.like('p1')), hasLength(1));
      expect(notifier.state.pendingLikePostIds, isEmpty);
      expect(notifier.state.posts.first.isLiked, isTrue);
    });

    test('locatePost highlights existing post and inserts missing post',
        () async {
      final http = FakeHttpClientPort();
      final notifier = _createNotifier(http);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [_postJson('p1'), _postJson('p2')],
            }),
          );
        }
        if (path == MomentsEndpoints.postById('p3')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson(_postJson('p3')),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await notifier.loadFeed();

      final found = await notifier.locatePost('p2');
      expect(found, isTrue);
      expect(notifier.state.highlightedPostId, 'p2');

      final inserted = await notifier.locatePost('p3');
      expect(inserted, isTrue);
      expect(notifier.state.highlightedPostId, 'p3');
      expect(notifier.state.posts.first.post.id, 'p3');
    });

    test('locatePost marks unknown post as missing', () async {
      final http = FakeHttpClientPort();
      final notifier = _createNotifier(http);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [_postJson('p1')]
            }),
          );
        }
        if (path == MomentsEndpoints.postById('missing')) {
          throw Exception('not found');
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await notifier.loadFeed();
      final found = await notifier.locatePost('missing');
      expect(found, isFalse);
      expect(notifier.state.missingPostId, 'missing');
      expect(notifier.state.highlightedPostId, isNull);
    });
  });
}
