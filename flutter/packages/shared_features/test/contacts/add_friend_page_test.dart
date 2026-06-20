import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/auth.dart';
import '../helpers/fakes.dart';

class _FakeWsClient implements WsClientPort {
  @override
  Stream<WsEvent> get events => const Stream.empty();
  @override
  Stream<WsConnectionState> get connectionState => const Stream.empty();
  @override
  bool get isConnected => true;
  @override
  String get wsBaseUrl => 'ws://localhost';
  @override
  Future<void> connect(String url) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> reconnect() async {}
  @override
  void send(Map<String, dynamic> message) {}

  @override
  void dispose() {}
}

Widget _buildApp({
  required List<Override> overrides,
  Widget? child,
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: child ?? const AddFriendPage(),
    ),
  );
}

void main() {
  group('AddFriendPage', () {
    late FakeHttpClientPort http;
    late ContactsApi api;
    late _FakeWsClient ws;
    late ContactsNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      api = ContactsApi(http);
      ws = _FakeWsClient();
      notifier = ContactsNotifier(api, ws);
    });

    testWidgets('shows search input on initial load', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Add Friend'), findsOneWidget);
      expect(find.text('Search by username or nickname'), findsOneWidget);
    });

    testWidgets('shows no match text when search returns empty', (tester) async {
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
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'nonexistent');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      expect(find.text('No matching users found'), findsOneWidget);
    });

    testWidgets('shows search results and add button', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'u2',
                  'username': 'testuser',
                  'nickname': 'Test User',
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

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'test');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('Add'), findsOneWidget);
    });

    testWidgets('shows error on search failure', (tester) async {
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
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'test');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      expect(find.text('Search failed, please try again'), findsOneWidget);
    });

    testWidgets('sendFriendRequest calls API on add tap', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'u2',
                  'username': 'target',
                  'nickname': 'Target',
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

      bool requestSent = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        requestSent = true;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'target');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(requestSent, isTrue);
    });

    testWidgets('shows You chip for current user in results', (tester) async {
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
                'id': 'u1',
                'username': 'me',
                'nickname': 'Me',
              },
            ],
          }),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'me');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      expect(find.text('You'), findsOneWidget);
    });

    testWidgets('no Placeholder text', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });

    testWidgets('sendFriendRequest success shows Request sent state',
        (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'id': 'u2', 'username': 'target', 'nickname': 'Target'},
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
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'target');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));
      expect(find.text('Add'), findsOneWidget);

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(find.text('Request sent'), findsOneWidget);
      expect(find.text('Add'), findsNothing);
    });

    testWidgets('sendFriendRequest failure does not show Request sent',
        (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'id': 'u2', 'username': 'target', 'nickname': 'Target'},
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
        throw Exception('Network error');
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'target');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));
      expect(find.text('Add'), findsOneWidget);

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(find.text('Request sent'), findsNothing);
      expect(find.text('Add'), findsOneWidget);
      expect(find.text('Failed to send request, please try again'), findsOneWidget);
    });

    testWidgets('failure allows retry and succeeds on second attempt',
        (tester) async {
      var postCount = 0;
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'id': 'u2', 'username': 'target', 'nickname': 'Target'},
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
        postCount++;
        if (postCount == 1) throw Exception('transient error');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'target');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      expect(find.text('Add'), findsOneWidget);

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      expect(find.text('Request sent'), findsOneWidget);
    });

    testWidgets('failure does not change sentRequestUserIds', (tester) async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('search')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'id': 'u2', 'username': 'target', 'nickname': 'Target'},
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
        throw Exception('fail');
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith((ref) => notifier),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'target');
      await tester.pumpAndSettle(const Duration(milliseconds: 600));

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(notifier.state.sentRequestUserIds, isEmpty);
    });
  });
}
