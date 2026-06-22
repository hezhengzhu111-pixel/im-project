import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';
import '../helpers/fakes.dart';

class _FakeWsClient implements WsClientPort {
  final _events = StreamController<WsEvent>.broadcast();
  final _state = StreamController<WsConnectionState>.broadcast();

  @override
  Stream<WsEvent> get events => _events.stream;
  @override
  Stream<WsConnectionState> get connectionState => _state.stream;
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

  void emit(WsEvent event) => _events.add(event);

  void dispose() {
    _events.close();
    _state.close();
  }
}

class _FakeWsEvent implements WsEvent {
  _FakeWsEvent(this.type, this.data);

  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp = 0;
}

void main() {
  group('ChatNotifier group messages', () {
    late FakeHttpClientPort http;
    late MessageApi messageApi;
    late _FakeWsClient ws;
    late ChatNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      messageApi = MessageApi(http);
      ws = _FakeWsClient();
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        ws,
        () => 'u1',
      );
    });

    tearDown(() {
      notifier.dispose();
      ws.dispose();
    });

    test('sendGroupMessage inserts pending message into group session',
        () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.sendGroup);
        expect(body?['groupId'], 'g1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'server-1',
            'senderId': 'u1',
            'groupId': 'g1',
            'isGroupChat': true,
            'messageType': 'TEXT',
            'content': 'hello group',
            'sendTime': '2026-01-01T00:00:00Z',
            'status': 'SENT',
          }),
        );
      };

      final result = await notifier.sendGroupMessage('g1', 'hello group');
      expect(result, isNotNull);

      final sessionKey = notifier.getGroupSessionKey('g1');
      final messages = notifier.state.messages[sessionKey];
      expect(messages, hasLength(1));
      expect(messages!.first.content, 'hello group');
      expect(messages.first.status, 'SENT');
    });

    test('incoming group message is routed to group session only', () async {
      ws.emit(_FakeWsEvent(WsMessageType.message, {
        'id': 'server-2',
        'senderId': 'u2',
        'groupId': 'g1',
        'isGroupChat': true,
        'messageType': 'TEXT',
        'content': 'from u2',
        'sendTime': '2026-01-01T00:00:00Z',
        'status': 'SENT',
      }));

      // Allow async event handling to complete.
      await Future.delayed(const Duration(milliseconds: 50));

      final groupSession = notifier.getGroupSessionKey('g1');
      // Private session key for u1/u2 is sorted lexicographically.
      const privateSession = 'u1_u2';

      expect(notifier.state.messages[groupSession], hasLength(1));
      expect(notifier.state.messages[privateSession], isNull);
    });

    test('group message status change updates local state', () async {
      final sessionKey = notifier.getGroupSessionKey('g1');
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [
            const Message(
              id: 'server-3',
              senderId: 'u1',
              groupId: 'g1',
              isGroupChat: true,
              messageType: 'TEXT',
              content: 'hello',
              sendTime: '2026-01-01T00:00:00Z',
              status: 'SENDING',
            ),
          ],
        },
      );

      ws.emit(_FakeWsEvent(WsMessageType.messageStatusChanged, {
        'id': 'server-3',
        'senderId': 'u1',
        'groupId': 'g1',
        'isGroupChat': true,
        'messageType': 'TEXT',
        'content': 'hello',
        'sendTime': '2026-01-01T00:00:00Z',
        'status': 'FAILED',
      }));

      await Future.delayed(const Duration(milliseconds: 50));

      final updated = notifier.state.messages[sessionKey]!.first;
      expect(updated.status, 'FAILED');
    });

    test('loadGroupMessages populates group session history', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.groupHistory('g1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'server-4',
                'senderId': 'u2',
                'groupId': 'g1',
                'isGroupChat': true,
                'messageType': 'TEXT',
                'content': 'history',
                'sendTime': '2026-01-01T00:00:00Z',
                'status': 'SENT',
              },
            ],
          }),
        );
      };

      await notifier.loadGroupMessages('g1');

      final sessionKey = notifier.getGroupSessionKey('g1');
      expect(notifier.state.messages[sessionKey], hasLength(1));
      expect(notifier.state.messages[sessionKey]!.first.content, 'history');
    });
  });
}
