import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_shared_features/src/moments/presentation/feed/widgets/post_card.dart';
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

Widget _buildFeedPage({
  required FakeHttpClientPort http,
  String? postId,
  ScrollController? scrollController,
}) {
  final controller = scrollController ?? ScrollController();
  final repository = MomentsRepository(
    MomentsApi(http),
    FileApi(http, FakeAnalyticsPort()),
  );
  return ProviderScope(
    overrides: [
      momentsRepositoryProvider.overrideWith((_) => repository),
      authStateProvider.overrideWith((_) => createTestAuthNotifier()),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('en'),
      home: Scaffold(
        body: CustomScrollView(
          controller: controller,
          slivers: [
            MomentsFeedPage(
              postId: postId,
              scrollController: controller,
            ),
          ],
        ),
      ),
    ),
  );
}

void main() {
  group('MomentsFeedPage', () {
    testWidgets('uses single scroll model without nested CustomScrollView',
        (tester) async {
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': [_postJson('p1')]}),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await tester.pumpWidget(_buildFeedPage(http: http));
      await tester.pumpAndSettle();

      expect(find.byType(CustomScrollView), findsOneWidget);
    });

    testWidgets('highlights and scrolls to existing postId', (tester) async {
      final http = FakeHttpClientPort();
      final controller = ScrollController();
      addTearDown(controller.dispose);

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          final items = List.generate(
            20,
            (i) => _postJson('p$i', content: 'Post $i'),
          );
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': items}),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await tester.pumpWidget(
        _buildFeedPage(http: http, postId: 'p10', scrollController: controller),
      );
      await tester.pumpAndSettle();

      expect(
        find.byWidgetPredicate(
          (widget) => widget is PostCard && widget.isHighlighted,
        ),
        findsOneWidget,
      );
      final firstCard = tester.widget<PostCard>(find.byType(PostCard).first);
      expect(firstCard.post.post.id, 'p10');
    });

    testWidgets('inserts and highlights missing postId', (tester) async {
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': [_postJson('p1')]}),
          );
        }
        if (path == MomentsEndpoints.postById('p2')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson(_postJson('p2')),
          );
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await tester.pumpWidget(_buildFeedPage(http: http, postId: 'p2'));
      await tester.pumpAndSettle();

      final highlighted = find.byWidgetPredicate(
        (widget) => widget is PostCard && widget.isHighlighted,
      );
      expect(highlighted, findsOneWidget);

      // The inserted post appears at the top of the feed.
      final firstCardFinder = find.byType(PostCard).first;
      final firstCard = tester.widget<PostCard>(firstCardFinder);
      expect(firstCard.post.post.id, 'p2');
    });

    testWidgets('shows not-found prompt when postId cannot be resolved',
        (tester) async {
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == MomentsEndpoints.feed) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': [_postJson('p1')]}),
          );
        }
        if (path == MomentsEndpoints.postById('missing')) {
          throw Exception('not found');
        }
        throw UnimplementedError('Unexpected GET $path');
      };

      await tester.pumpWidget(_buildFeedPage(http: http, postId: 'missing'));
      await tester.pumpAndSettle();

      expect(find.text('Post not found'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) => widget is PostCard && widget.isHighlighted,
        ),
        findsNothing,
      );
    });

    testWidgets('scroll to bottom triggers next page only once',
        (tester) async {
      final http = FakeHttpClientPort();
      var feedCalls = 0;

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path != MomentsEndpoints.feed) {
          throw UnimplementedError('Unexpected GET $path');
        }
        feedCalls++;
        if (feedCalls == 1) {
          final items = List.generate(
            20,
            (i) => _postJson('p$i', content: 'Post $i'),
          );
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': items}),
          );
        }
        // Simulate a slow second page so concurrent scroll events cannot
        // enqueue extra requests.
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };

      await tester.pumpWidget(_buildFeedPage(http: http));
      await tester.pumpAndSettle();
      expect(feedCalls, 1);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, -5000));
      await tester.pump();
      // The guard in the notifier should keep the second request single.
      expect(feedCalls, 2);

      await tester.pumpAndSettle();
      expect(feedCalls, 2);
    });
  });
}
