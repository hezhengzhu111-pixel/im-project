import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_shared_features/chat.dart';
import '../helpers/fakes.dart';

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: Locale('en'),
      home: MomentsNotificationsPage(),
    ),
  );
}

void main() {
  group('MomentsNotificationsPage', () {
    late FakeHttpClientPort http;

    setUp(() {
      http = FakeHttpClientPort();
    });

    testWidgets('shows loading indicator initially', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        // Simulate slow network — return empty list after a short delay
        await Future<void>.delayed(const Duration(milliseconds: 100));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };

      final api = MomentsApi(http);
      final repository =
          MomentsRepository(api, FileApi(http, FakeAnalyticsPort()));
      final notifier = MomentsNotificationsNotifier(repository);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) => notifier),
          ],
        ),
      );
      // First pump triggers initState + postFrameCallback
      await tester.pump();
      // Second pump starts the Future but doesn't complete it
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Let the delayed future complete so no timers remain pending
      await tester.pumpAndSettle();
    });

    testWidgets('shows empty state when no notifications', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) =>
                MomentsNotificationsNotifier(MomentsRepository(
                    MomentsApi(http), FileApi(http, FakeAnalyticsPort())))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No notifications'), findsOneWidget);
    });

    testWidgets('shows error state', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Network error');
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) =>
                MomentsNotificationsNotifier(MomentsRepository(
                    MomentsApi(http), FileApi(http, FakeAnalyticsPort())))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows notification list', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'n1',
                'type': 'like',
                'createdAt': DateTime.now().toIso8601String(),
                'isRead': false,
                'userName': 'TestUser',
                'userNickname': 'Test',
              },
              {
                'id': 'n2',
                'type': 'comment',
                'createdAt': DateTime.now().toIso8601String(),
                'isRead': true,
                'userName': 'OtherUser',
                'userNickname': 'Other',
              },
            ],
          }),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) =>
                MomentsNotificationsNotifier(MomentsRepository(
                    MomentsApi(http), FileApi(http, FakeAnalyticsPort())))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Test liked your moment'), findsOneWidget);
      expect(find.text('Other commented on your moment'), findsOneWidget);
    });

    testWidgets('markAllRead button visible with unread', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'n1',
                'type': 'like',
                'createdAt': DateTime.now().toIso8601String(),
                'isRead': false,
                'userName': 'User',
              },
            ],
          }),
        );
      };

      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      final notifier = MomentsNotificationsNotifier(MomentsRepository(
          MomentsApi(http), FileApi(http, FakeAnalyticsPort())));

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) => notifier),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Mark all as read'), findsOneWidget);
      await tester.tap(find.text('Mark all as read'));
      await tester.pumpAndSettle();

      expect(notifier.state.unreadCount, 0);
    });

    testWidgets('renders notifications with invalid createdAt without crashing',
        (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'n-invalid-time',
                'type': 'like',
                'createdAt': 'not-a-date',
                'isRead': false,
                'userName': 'BadTimeUser',
                'userNickname': 'BadTime',
              },
            ],
          }),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) =>
                MomentsNotificationsNotifier(MomentsRepository(
                    MomentsApi(http), FileApi(http, FakeAnalyticsPort())))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('BadTime liked your moment'), findsOneWidget);
      // The raw invalid timestamp should be shown as a fallback.
      expect(find.text('not-a-date'), findsOneWidget);
    });

    testWidgets('no Placeholder text', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider.overrideWith((ref) =>
                MomentsNotificationsNotifier(MomentsRepository(
                    MomentsApi(http), FileApi(http, FakeAnalyticsPort())))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });
  });
}
