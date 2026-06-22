import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/group.dart';

import '../helpers/fakes.dart';

Widget _buildApp({
  required FakeHttpClientPort http,
  required FakeWsClient ws,
  required List<Override> overrides,
}) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const CreateGroupPage(),
      ),
      GoRoute(
        path: '/chat',
        builder: (context, state) => const Scaffold(body: Text('Chat')),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      httpClientProvider.overrideWith((ref) => http),
      wsClientProvider.overrideWith((ref) => ws),
      analyticsProvider.overrideWith((ref) => FakeAnalyticsPort()),
      chatStateProvider.overrideWith((ref) => FakeChatNotifier()),
      ...overrides,
    ],
    child: MaterialApp.router(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

void main() {
  group('CreateGroupPage', () {
    late FakeHttpClientPort http;
    late FakeWsClient ws;

    setUp(() {
      http = FakeHttpClientPort();
      ws = FakeWsClient();
    });

    testWidgets('shows form fields and create button', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          ws: ws,
          http: http,
          overrides: [
            contactsStateProvider
                .overrideWith((ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Group'), findsWidgets);
      expect(find.text('Group name'), findsOneWidget);
      expect(find.text('Description (optional)'), findsOneWidget);
      expect(find.text('Create'), findsOneWidget);
    });

    testWidgets('empty name does not call API', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          ws: ws,
          http: http,
          overrides: [
            contactsStateProvider
                .overrideWith((ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      final createButton = find.text('Create');
      await tester.tap(createButton);
      await tester.pumpAndSettle();

      expect(http.requests.where((r) => r.$1 == 'POST'), isEmpty);
    });

    testWidgets('createGroup called with valid name and selected member', (tester) async {
      bool postCalled = false;
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
                  'friendId': 'u2',
                  'username': 'friend2',
                  'nickname': 'Friend Two',
                },
              ],
            }),
          );
        }
        if (path == FriendEndpoints.requests) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'items': <dynamic>[]}), // no pending requests
          );
        }
        if (path == UserEndpoints.onlineStatus) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson(<String, dynamic>{}),
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
        postCalled = true;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'g1',
            'name': 'Test Group',
            'ownerId': 'u1',
            'createTime': '2026-01-01',
          }),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          ws: ws,
          http: http,
          overrides: [
            contactsStateProvider
                .overrideWith((ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextField, 'Group name'),
        'Test Group',
      );

      // Select the friend checkbox created from contacts list.
      await tester.tap(find.byType(CheckboxListTile).first);
      await tester.pumpAndSettle();

      final createButton = find.text('Create');
      await tester.tap(createButton);
      await tester.pumpAndSettle();

      expect(postCalled, isTrue);
      expect(http.requests.where((r) => r.$1 == 'POST' && r.$2 == GroupEndpoints.create).length, 1);
    });

    testWidgets('no Placeholder text', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          ws: ws,
          http: http,
          overrides: [
            contactsStateProvider
                .overrideWith((ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });
  });
}
