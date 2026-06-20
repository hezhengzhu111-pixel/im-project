import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';

import '../helpers/fakes.dart';

class _FakeChatNotifier extends ChatNotifier {
  _FakeChatNotifier()
      : super(
          MessageApi(FakeHttpClientPort(), currentUserId: () => 'current-user'),
          MessagePipeline(),
          FakeWsClient(),
          () => 'current-user',
        );
}

Widget _buildApp({
  required ContactsNotifier notifier,
  ChatNotifier? chatNotifier,
  String? currentUserId,
  Widget? child,
}) {
  return ProviderScope(
    overrides: [
      contactsStateProvider.overrideWith((ref) => notifier),
      currentUserIdProvider.overrideWithValue(currentUserId ?? 'current-user'),
      if (chatNotifier != null)
        chatStateProvider.overrideWith((ref) => chatNotifier),
    ],
    child: MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: child ?? const Scaffold(body: ContactsPage()),
    ),
  );
}

void main() {
  group('ContactsPage', () {
    late FakeHttpClientPort http;
    late ContactsApi api;
    late FakeWsClient ws;
    late ContactsNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      api = ContactsApi(http);
      ws = FakeWsClient();
      notifier = ContactsNotifier(api, ws);
    });

    tearDown(() {
      // The notifier is owned by Riverpod via ProviderScope; do not dispose it
      // manually to avoid double-dispose errors.
      ws.dispose();
    });

    testWidgets('mobile drill-in navigates to detail page', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'f1',
                  'friendId': 'user-2',
                  'username': 'alice',
                  'nickname': 'Alice',
                },
              ],
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        }
        throw UnimplementedError('Unexpected POST $path');
      };

      await tester.pumpWidget(_buildApp(notifier: notifier));
      await tester.pumpAndSettle();

      // Default breakpoint is compact, so tapping a friend should push detail.
      await tester.tap(find.text('Alice'));
      await tester.pumpAndSettle();

      expect(find.text('Send message'), findsOneWidget);
      expect(find.byType(BackButton), findsOneWidget);

      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();

      expect(find.text('Send message'), findsNothing);
    });

    testWidgets('shows request badge for pending incoming requests',
        (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': <dynamic>[]}),
          );
        }
        if (path == FriendEndpoints.requests) {
          return ApiResponse<T>(
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
                  'status': 'PENDING',
                  'createTime': '2026-05-29T00:00:00Z',
                },
              ],
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
        }
        throw UnimplementedError('Unexpected POST $path');
      };

      await tester.pumpWidget(_buildApp(notifier: notifier));
      await tester.pumpAndSettle();

      expect(find.text('Requests (1)'), findsOneWidget);
      expect(find.byType(Badge), findsOneWidget);
    });

    testWidgets('deleting current chat friend clears active session',
        (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'f1',
                  'friendId': 'user-2',
                  'username': 'alice',
                  'nickname': 'Alice',
                },
              ],
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
        }
        throw UnimplementedError('Unexpected POST $path');
      };
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.remove) {
          return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
        }
        throw UnimplementedError('Unexpected DELETE $path');
      };

      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [
          ChatSession(
            id: 'user-2_current-user',
            type: 'private',
            targetId: 'user-2',
            targetName: 'Alice',
            unreadCount: 0,
            conversationType: 'private',
          ),
        ],
        activeSessionId: 'user-2_current-user',
      );

      await tester.pumpWidget(
        _buildApp(notifier: notifier, chatNotifier: chatNotifier),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.more_horiz));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Delete friend'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(chatNotifier.state.activeSessionId, isNull);
    });

    testWidgets('shows search empty state', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'f1',
                  'friendId': 'user-2',
                  'username': 'alice',
                  'nickname': 'Alice',
                },
              ],
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
        }
        throw UnimplementedError('Unexpected POST $path');
      };

      await tester.pumpWidget(_buildApp(notifier: notifier));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'zzzz');
      await tester.pumpAndSettle();

      expect(find.text('No matching contacts'), findsOneWidget);
    });
  });
}
