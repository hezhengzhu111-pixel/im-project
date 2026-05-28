import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_core/src/network/ws_connection_state.dart';
import 'package:im_web/core/debug/debug_panel_entry.dart';
import 'package:im_web/core/network/network_providers.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';
import 'package:im_web/features/chat/presentation/chat_providers.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';

import '../../helpers/test_providers.dart';

void main() {
  // Verify that kDebugMode is true in the test environment
  test('kDebugMode should be true in test environment', () {
    expect(kDebugMode, isTrue);
  });

  group('DebugPanelEntry', () {
    // Helper to create a fake ChatStateWithOutbox
    ChatStateWithOutbox makeChatState({
      String? activeSessionId,
      List<ChatSession> sessions = const [],
    }) {
      return ChatStateWithOutbox(
        activeSessionId: activeSessionId,
        sessions: sessions,
      );
    }

    Widget buildEntry({
      AuthState? authState,
      AsyncValue<WsConnectionState>? wsState,
      ChatStateWithOutbox? chatState,
    }) {
      final container = createTestContainer(overrides: [
        // Override authStateProvider with a fake StateNotifier
        authStateProvider.overrideWith((ref) {
          return _FakeAuthNotifier(authState ?? const AuthState());
        }),
        // Override wsStateProvider with a fake StreamProvider
        wsStateProvider.overrideWith((ref) {
          return Stream.value(
            wsState?.value ?? WsConnectionState.disconnected,
          );
        }),
        // Override chatStateProvider with a fake StateNotifier
        chatStateProvider.overrideWith((ref) {
          return _FakeChatNotifier(
            chatState ?? makeChatState(),
          );
        }),
      ]);

      return UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/',
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const Scaffold(
                  body: Stack(
                    children: [DebugPanelEntry()],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    testWidgets('should show bug_report icon FAB initially', (tester) async {
      await tester.pumpWidget(buildEntry());
      await tester.pumpAndSettle();

      // The FAB should display the bug_report icon when panel is collapsed
      expect(find.byIcon(Icons.bug_report), findsOneWidget);
      expect(find.byIcon(Icons.close), findsNothing);
    });

    testWidgets('should show close icon when FAB is tapped (panel expanded)',
        (tester) async {
      await tester.pumpWidget(buildEntry());
      await tester.pumpAndSettle();

      // Tap the FAB to expand the panel
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // Now the FAB should show the close icon
      expect(find.byIcon(Icons.close), findsOneWidget);
      expect(find.byIcon(Icons.bug_report), findsNothing);
    });

    testWidgets(
        'should hide panel and show bug_report icon when close is tapped',
        (tester) async {
      await tester.pumpWidget(buildEntry());
      await tester.pumpAndSettle();

      // Expand
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.close), findsOneWidget);

      // Collapse
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.bug_report), findsOneWidget);
      expect(find.byIcon(Icons.close), findsNothing);
    });

    testWidgets('should display DEBUG PANEL text when expanded',
        (tester) async {
      await tester.pumpWidget(buildEntry());
      await tester.pumpAndSettle();

      // Expand the panel
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(find.text('DEBUG PANEL'), findsOneWidget);
      expect(find.text('Auth'), findsOneWidget);
      expect(find.text('WebSocket'), findsOneWidget);
      expect(find.text('Route'), findsOneWidget);
      expect(find.text('Session'), findsOneWidget);
      expect(find.text('Sessions'), findsOneWidget);
    });
  });
}

// ---------------------------------------------------------------------------
// Fake StateNotifiers for test overrides
// ---------------------------------------------------------------------------

class _FakeAuthNotifier extends StateNotifier<AuthState>
    implements AuthNotifier {
  _FakeAuthNotifier(AuthState state) : super(state);

  @override
  Future<void> login(String username, String password,
      {bool rememberMe = false}) async {}

  @override
  Future<void> register(String username, String email, String password) async {}

  @override
  Future<void> logout() async {}

  @override
  Future<void> restoreSession() async {}

  @override
  Future<void> checkAuth() async {}

  @override
  Future<bool> ensureFreshSession() async => true;

  @override
  bool hasPermission(String permission) => false;

  @override
  bool hasAnyPermission(List<String> permissions) => false;
}

class _FakeChatNotifier extends StateNotifier<ChatStateWithOutbox>
    implements ChatNotifierWithOutbox {
  _FakeChatNotifier(ChatStateWithOutbox state) : super(state);

  @override
  Future<void> loadSessions() async {}

  @override
  void setActiveSession(String? sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
  }

  @override
  Future<void> loadMessages(String targetId, {int? page, int? size}) async {}

  @override
  Future<void> loadGroupMessages(String groupId,
      {int? page, int? size}) async {}

  @override
  Future<Message?> sendMessage(String receiverId, String content,
          {String messageType = 'text',
          String? clientMessageId,
          String? mediaUrl,
          String? mediaName,
          int? mediaSize,
          String? thumbnailUrl,
          int? duration}) async =>
      null;

  @override
  Future<Message?> sendGroupMessage(String groupId, String content,
          {String messageType = 'text',
          String? clientMessageId,
          String? mediaUrl,
          String? mediaName,
          int? mediaSize,
          String? thumbnailUrl,
          int? duration,
          List<String>? mentionedUserIds}) async =>
      null;

  @override
  void addMessage(String sessionKey, Message message) {}

  @override
  Future<void> retryMessage(String sessionKey, String messageId) async {}

  @override
  Future<void> retryAllFailed() async {}

  @override
  Future<ChatSession?> getOrCreateSession(String targetId,
          {String? targetName, String? targetAvatar}) async =>
      null;

  @override
  String getGroupSessionKey(String groupId) => 'group_$groupId';

  @override
  Future<void> markRead(String conversationId) async {}

  @override
  E2eeNegotiationEvent? get pendingNegotiation => null;

  @override
  Map<String, E2eeNegotiationEvent> get pendingNegotiations => const {};

  @override
  E2eeNegotiationEvent? get activePendingNegotiation => null;

  @override
  E2eeNegotiationEvent? pendingNegotiationForSession(String sessionId) => null;

  @override
  void clearPendingNegotiation([String? sessionId]) {}

  @override
  Future<bool> acceptPendingNegotiation(String sessionId) async => false;

  @override
  Future<void> rejectPendingNegotiation(String sessionId) async {}

  @override
  Future<void> disableEncryptionForSession(String sessionId) async {}

  @override
  Future<void> loadMoreHistory(String sessionId, {int size = 20}) async {}
}
