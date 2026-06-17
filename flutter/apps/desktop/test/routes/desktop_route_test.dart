import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_shared_features/settings.dart';

class _FakeHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    if (path == AiEndpoints.settings) {
      return ApiResponse<T>(
        code: 200,
        message: 'ok',
        data: fromJson({'autoReplyEnabled': false, 'autoReplyPersona': ''}),
      );
    }
    return ApiResponse<T>(
        code: 200, message: 'ok', data: fromJson({'items': <dynamic>[]}));
  }

  @override
  Future<ApiResponse<T>> post<T>(String path,
          {dynamic body, required T Function(Map<String, dynamic>) fromJson}) async =>
      ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));

  @override
  Future<ApiResponse<T>> put<T>(String path,
          {dynamic body, required T Function(Map<String, dynamic>) fromJson}) async =>
      ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));

  @override
  Future<ApiResponse<T>> delete<T>(String path,
          {dynamic body, Map<String, dynamic>? queryParameters, required T Function(Map<String, dynamic>) fromJson}) async =>
      ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
}

class _FakeWsClient implements WsClientPort {
  @override Stream<WsEvent> get events => const Stream.empty();
  @override Stream<WsConnectionState> get connectionState => const Stream.empty();
  @override bool get isConnected => true;
  @override String get wsBaseUrl => 'ws://localhost';
  @override Future<void> connect(String url) async {}
  @override Future<void> disconnect() async {}
  @override Future<void> reconnect() async {}
  @override void send(Map<String, dynamic> message) {}
}

class _FakeAnalyticsPort implements AnalyticsPort {
  @override void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}
  @override void setUserId(String? userId) {}
  @override void setUserProperties(Map<String, dynamic> properties) {}
}

class _FakeAuthRepository implements AuthRepository {
  @override
  Future<UserAuthResponse> login(LoginRequest request) async =>
      UserAuthResponse(success: true, user: const User(id: 'u1', username: 'test'), token: 't');
  @override
  Future<UserAuthResponse> register(RegisterRequest request) async =>
      UserAuthResponse(success: true, user: const User(id: 'u1', username: 'test'), token: 't');
  @override
  Future<AuthResult> restoreSession() async =>
      AuthSuccess(user: const User(id: 'u1', username: 'test'), permissions: []);
  @override
  Future<void> logout() async {}
}

Widget _buildRouteApp(Widget page) {
  final authNotifier = AuthNotifier(
    _FakeAuthRepository(),
    _FakeWsClient(),
    _FakeHttpClientPort(),
    _FakeAnalyticsPort(),
  );
  authNotifier.state = const AuthState(
    user: User(id: 'u1', username: 'testuser', nickname: 'Test User'),
    status: AuthStatus.authenticated,
  );
  return ProviderScope(
    overrides: [
      httpClientProvider.overrideWithValue(_FakeHttpClientPort()),
      wsClientProvider.overrideWithValue(_FakeWsClient()),
      analyticsProvider.overrideWithValue(_FakeAnalyticsPort()),
      authStateProvider.overrideWith((ref) => authNotifier),
    ],
    child: MaterialApp(home: page),
  );
}

void main() {
  group('Desktop route tests - pages are real, not Placeholder', () {
    testWidgets('/contacts/add renders AddFriendPage', (tester) async {
      await tester.pumpWidget(_buildRouteApp(const AddFriendPage()));
      await tester.pumpAndSettle();
      expect(find.byType(AddFriendPage), findsOneWidget);
      expect(find.text('Add Friend'), findsOneWidget);
      expect(find.text('Placeholder'), findsNothing);
    });

    testWidgets('/groups/create renders CreateGroupPage', (tester) async {
      await tester.pumpWidget(_buildRouteApp(const CreateGroupPage()));
      await tester.pumpAndSettle();
      expect(find.byType(CreateGroupPage), findsOneWidget);
      expect(find.text('Group Name'), findsOneWidget);
      expect(find.text('Placeholder'), findsNothing);
    });

    testWidgets('/moments/notifications renders MomentsNotificationsPage', (tester) async {
      await tester.pumpWidget(_buildRouteApp(const MomentsNotificationsPage()));
      await tester.pumpAndSettle();
      expect(find.byType(MomentsNotificationsPage), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Placeholder'), findsNothing);
    });

    testWidgets('/settings/profile renders ProfileSettingsPage', (tester) async {
      await tester.pumpWidget(_buildRouteApp(const ProfileSettingsPage()));
      await tester.pumpAndSettle();
      expect(find.byType(ProfileSettingsPage), findsOneWidget);
      expect(find.text('Profile Settings'), findsOneWidget);
      expect(find.text('Placeholder'), findsNothing);
    });

    testWidgets('/settings/ai renders AiSettingsPage', (tester) async {
      await tester.pumpWidget(_buildRouteApp(const AiSettingsPage()));
      await tester.pumpAndSettle();
      expect(find.byType(AiSettingsPage), findsOneWidget);
      expect(find.text('AI Settings'), findsWidgets);
      expect(find.text('Placeholder'), findsNothing);
    });

    testWidgets('unknown route shows not found page', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: Center(child: Text('Page not found'))),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Page not found'), findsOneWidget);
    });
  });
}
