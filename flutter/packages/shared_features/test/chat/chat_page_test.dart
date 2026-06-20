import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/core.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_ui/im_ui.dart';

import '../helpers/fakes.dart';

class _FakeChatNotifier extends ChatNotifier {
  _FakeChatNotifier() : super(MessageApi(FakeHttpClientPort(), currentUserId: () => 'u1'), MessagePipeline(), FakeWsClient(), () => 'u1');

  @override
  Future<void> loadSessions() async {}

  @override
  void setActiveSession(String? sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
  }

  @override
  Future<void> loadMessages(String targetId, {int? page, int? size}) async {}

  @override
  Future<void> loadGroupMessages(String groupId, {int? page, int? size}) async {}

  @override
  Future<void> loadMoreHistory(String sessionId, {int size = 20}) async {}

  @override
  Future<Message?> sendMessage(
    String receiverId,
    String content, {
    String messageType = 'TEXT',
    String? clientMessageId,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
    Map<String, dynamic>? extra,
  }) async => null;

  @override
  Future<Message?> sendGroupMessage(
    String groupId,
    String content, {
    String messageType = 'TEXT',
    String? clientMessageId,
    List<String>? mentionedUserIds,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
    Map<String, dynamic>? extra,
  }) async => null;

  @override
  Future<void> retryAllFailed() async {}
}

class _FakeGroupApi extends GroupApi {
  _FakeGroupApi() : super(FakeHttpClientPort());

  List<GroupMember> membersToReturn = const [];
  Exception? exceptionToThrow;

  @override
  Future<List<GroupMember>> getMembers(String groupId) async {
    if (exceptionToThrow != null) throw exceptionToThrow!;
    return membersToReturn;
  }
}

class _FakeNetworkDataSource implements NetworkStatusDataSource {
  @override
  bool get isNavigatorOnline => true;

  @override
  Stream<void> get onOnline => const Stream.empty();

  @override
  Stream<void> get onOffline => const Stream.empty();

  @override
  Future<bool> checkServerReachable(String url) async => true;
}

Widget _buildApp({
  required AuthNotifier authNotifier,
  required ChatNotifier chatNotifier,
  GroupApi? groupApi,
  String? sessionId,
}) {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => authNotifier),
      chatStateProvider.overrideWith((ref) => chatNotifier),
      groupApiProvider.overrideWithValue(groupApi ?? _FakeGroupApi()),
      networkStatusProvider.overrideWith(
        (ref) => NetworkStatusNotifier(dataSource: _FakeNetworkDataSource()),
      ),
    ],
    child: MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: BreakpointScope(
          child: ChatPage(sessionId: sessionId),
        ),
      ),
    ),
  );
}

ChatSession _privateSession({String id = 's1', String targetId = 'u2', String targetName = 'Alice'}) {
  return ChatSession(
    id: id,
    type: 'private',
    targetId: targetId,
    targetName: targetName,
    unreadCount: 0,
    conversationType: 'private',
  );
}

ChatSession _groupSession({String id = 'g1', String targetId = 'group1', String targetName = 'Team'}) {
  return ChatSession(
    id: id,
    type: 'group',
    targetId: targetId,
    targetName: targetName,
    unreadCount: 0,
    conversationType: 'group',
  );
}

Message _message({String id = 'm1', String senderId = 'u2', String content = 'hi'}) {
  return Message(
    id: id,
    senderId: senderId,
    isGroupChat: false,
    messageType: 'text',
    content: content,
    sendTime: '2024-01-01T00:00:00Z',
    status: 'sent',
  );
}

extension _TestBreakpoint on WidgetTester {
  void setBreakpoint(Breakpoint bp) {
    final width = switch (bp) {
      Breakpoint.compact => 400.0,
      Breakpoint.medium => 700.0,
      Breakpoint.expanded => 1000.0,
      Breakpoint.large => 1300.0,
    };
    view.physicalSize = Size(width * 2, 1200);
    view.devicePixelRatio = 2.0;
    addTearDown(() {
      view.resetPhysicalSize();
      view.resetDevicePixelRatio();
    });
  }
}

void main() {
  group('ChatPage', () {
    late AuthNotifier authNotifier;

    setUp(() {
      authNotifier = createTestAuthNotifier();
    });

    testWidgets('shows deep-link not found state with retry and back', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = const ChatState();

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
        sessionId: 'missing-session',
      ));
      await tester.pumpAndSettle();

      expect(find.text('Conversation not found'), findsOneWidget);
      expect(find.text('The conversation does not exist or you no longer have access.'), findsOneWidget);
      expect(find.text('Back to conversations'), findsOneWidget);
      expect(find.byIcon(Icons.refresh), findsOneWidget);

      await tester.tap(find.text('Back to conversations'));
      await tester.pumpAndSettle();

      expect(find.text('No conversations yet'), findsOneWidget);
    });

    testWidgets('resolves deep link and shows active conversation', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession(id: 's1', targetId: 'u2', targetName: 'Alice')],
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
        sessionId: 'u2',
      ));
      await tester.pumpAndSettle();

      expect(find.text('Alice'), findsWidgets);
    });

    testWidgets('shows loading state when messages are loading', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession()],
        activeSessionId: 's1',
        isLoading: true,
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pump();

      expect(find.text('Loading conversation...'), findsOneWidget);
    });

    testWidgets('shows empty state when there are no messages', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession()],
        activeSessionId: 's1',
        isLoading: false,
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pumpAndSettle();

      expect(find.text('No messages yet'), findsOneWidget);
    });

    testWidgets('shows load-messages failed state with retry', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession()],
        activeSessionId: 's1',
        error: 'network error',
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pumpAndSettle();

      expect(find.text('Failed to load messages'), findsOneWidget);
      expect(find.byIcon(Icons.refresh), findsOneWidget);
    });

    testWidgets('gates LoadMoreHistoryButton by hasMoreHistoryBySession', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession()],
        activeSessionId: 's1',
        messages: {
          's1': [_message()],
        },
        hasMoreHistoryBySession: const {'s1': true},
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pumpAndSettle();

      expect(find.text('Load earlier messages'), findsOneWidget);

      chatNotifier.state = chatNotifier.state.copyWith(
        hasMoreHistoryBySession: const {'s1': false},
      );
      await tester.pumpAndSettle();

      expect(find.text('Load earlier messages'), findsNothing);
    });

    testWidgets('medium breakpoint shows session list and chat side by side', (tester) async {
      tester.setBreakpoint(Breakpoint.medium);
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession(targetName: 'Alice')],
        activeSessionId: 's1',
        messages: {
          's1': [_message()],
        },
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pumpAndSettle();

      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Alice'), findsWidgets);
      expect(find.text('No messages yet'), findsNothing);
    });

    testWidgets('compact breakpoint hides session list when a session is active', (tester) async {
      tester.setBreakpoint(Breakpoint.compact);
      final chatNotifier = _FakeChatNotifier();
      chatNotifier.state = ChatState(
        sessions: [_privateSession(targetName: 'Alice')],
        activeSessionId: 's1',
        messages: {
          's1': [_message()],
        },
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
      ));
      await tester.pumpAndSettle();

      expect(find.text('Chat'), findsNothing);
      expect(find.text('Alice'), findsWidgets);
    });

    testWidgets('group member load failure shows mention unavailable banner', (tester) async {
      final chatNotifier = _FakeChatNotifier();
      final groupApi = _FakeGroupApi()..exceptionToThrow = Exception('boom');
      chatNotifier.state = ChatState(
        sessions: [_groupSession(id: 'g1', targetId: 'group1')],
      );

      await tester.pumpWidget(_buildApp(
        authNotifier: authNotifier,
        chatNotifier: chatNotifier,
        groupApi: groupApi,
      ));
      await tester.pumpAndSettle();

      expect(find.text('Member list unavailable; @ mentions are disabled'), findsOneWidget);
    });
  });
}
