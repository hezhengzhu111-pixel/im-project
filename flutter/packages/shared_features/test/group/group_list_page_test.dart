import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_ui/im_ui.dart';

import '../helpers/fakes.dart';

Widget _buildApp({
  required FakeHttpClientPort http,
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: [
      httpClientProvider.overrideWith((ref) => http),
      wsClientProvider.overrideWith((ref) => FakeWsClient()),
      analyticsProvider.overrideWith((ref) => FakeAnalyticsPort()),
      chatStateProvider.overrideWith((ref) => FakeChatNotifier()),
      ...overrides,
    ],
    child: BreakpointScope(
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const Scaffold(body: GroupListPage()),
      ),
    ),
  );
}

void main() {
  group('GroupListPage', () {
    late FakeHttpClientPort http;
    late AuthNotifier authNotifier;
    late User testUser;

    setUp(() {
      http = FakeHttpClientPort();
      authNotifier = createTestAuthNotifier();
      testUser = authNotifier.state.user!;
      // Start unauthenticated so auth-ready transitions can be observed.
      authNotifier.state = const AuthState(status: AuthStatus.initial);
    });

    void _setGroupsResponse(List<Map<String, dynamic>> groups) {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': groups}),
        );
      };
    }

    testWidgets('loads groups after auth becomes ready', (tester) async {
      _setGroupsResponse([
        {'id': 'g1', 'name': 'Group One'},
      ]);

      await tester.pumpWidget(
        _buildApp(
          http: http,
          overrides: [
            authStateProvider.overrideWith((ref) => authNotifier),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(http.requests.where((r) => r.$1 == 'GET'), isEmpty);

      authNotifier.state = AuthState(
        user: testUser,
        status: AuthStatus.authenticated,
      );
      await tester.pumpAndSettle();

      expect(http.requests.where((r) => r.$1 == 'GET'), hasLength(1));
      expect(find.text('Group One'), findsOneWidget);
    });

    void _authenticate() {
      authNotifier.state = AuthState(
        user: testUser,
        status: AuthStatus.authenticated,
      );
    }

    testWidgets('renders group detail on desktop', (tester) async {
      tester.view.physicalSize = const Size(1600, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      _setGroupsResponse([
        {
          'id': 'g1',
          'name': 'Test Group',
          'description': 'A test group',
          'memberCount': 3,
        },
      ]);
      _authenticate();

      await tester.pumpWidget(
        _buildApp(
          http: http,
          overrides: [
            authStateProvider.overrideWith((ref) => authNotifier),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Test Group'));
      await tester.pumpAndSettle();

      expect(find.text('Test Group'), findsWidgets);
      expect(find.text('A test group'), findsOneWidget);
      expect(find.text('Enter chat'), findsOneWidget);
      expect(find.text('Members'), findsOneWidget);
      expect(find.text('Leave group'), findsOneWidget);
    });

    testWidgets('leaving group updates list', (tester) async {
      tester.view.physicalSize = const Size(1600, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      _setGroupsResponse([
        {'id': 'g1', 'name': 'Test Group', 'memberCount': 3},
        {'id': 'g2', 'name': 'Other Group', 'memberCount': 2},
      ]);
      _authenticate();

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
          http: http,
          overrides: [
            authStateProvider.overrideWith((ref) => authNotifier),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Test Group'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('group_leave_button')));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(TextButton, 'Leave group'));
      await tester.pumpAndSettle();

      expect(find.text('Test Group'), findsNothing);
      expect(find.text('Other Group'), findsOneWidget);
    });

    testWidgets('mobile drill-in to group detail', (tester) async {
      tester.view.physicalSize = const Size(400, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      _setGroupsResponse([
        {
          'id': 'g1',
          'name': 'Mobile Group',
          'description': 'Compact view',
          'memberCount': 5,
        },
      ]);
      _authenticate();

      await tester.pumpWidget(
        _buildApp(
          http: http,
          overrides: [
            authStateProvider.overrideWith((ref) => authNotifier),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mobile Group'));
      await tester.pumpAndSettle();

      expect(find.text('Mobile Group'), findsWidgets);
      expect(find.text('Compact view'), findsOneWidget);
      expect(find.byType(BackButton), findsOneWidget);
    });

    testWidgets('shows empty state and error state', (tester) async {
      tester.view.physicalSize = const Size(1600, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      _authenticate();

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('network down');
      };

      await tester.pumpWidget(
        _buildApp(
          http: http,
          overrides: [
            authStateProvider.overrideWith((ref) => authNotifier),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(
          find.text('Loading failed: Exception: network down'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
