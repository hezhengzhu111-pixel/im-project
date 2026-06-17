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

  void dispose() {
    _events.close();
    _state.close();
  }
}

Message _sampleMessage(String id, {String status = 'SENT'}) => Message(
      id: id,
      senderId: 'u1',
      receiverId: 'u2',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2026-01-01T00:00:00Z',
      status: status,
    );

Map<String, dynamic> _sampleMessageJson(String id, {String status = 'SENT'}) =>
    {
      'id': id,
      'senderId': 'u1',
      'receiverId': 'u2',
      'isGroupChat': false,
      'messageType': 'TEXT',
      'content': 'hello',
      'sendTime': '2026-01-01T00:00:00Z',
      'status': status,
    };

void main() {
  group('ChatNotifier recallMessage / deleteMessage', () {
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

    test('recallMessage calls API and updates local message state', () async {
      // Pre-populate state with a message via direct state mutation to avoid
      // addMessage normalization issues.
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-1', status: 'SENT')],
        },
      );
      expect(notifier.state.messages[sessionKey], hasLength(1));

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.recall('msg-1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessageJson('msg-1', status: 'RECALLED')),
        );
      };

      final result = await notifier.recallMessage('msg-1');
      expect(result, isNotNull);
      expect(result!.status, 'RECALLED');

      // Local state should be updated.
      final localMsg = notifier.state.messages[sessionKey]!.first;
      expect(localMsg.status, 'RECALLED');
    });

    test('deleteMessage calls API and updates local message state', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-2', status: 'SENT')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.delete('msg-2'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessageJson('msg-2', status: 'DELETED')),
        );
      };

      final result = await notifier.deleteMessage('msg-2');
      expect(result, isNotNull);
      expect(result!.status, 'DELETED');

      final localMsg = notifier.state.messages[sessionKey]!.first;
      expect(localMsg.status, 'DELETED');
    });

    test('recallMessage sets error on API failure', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-3')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Not found');
      };

      final result = await notifier.recallMessage('msg-3');
      expect(result, isNull);
      expect(notifier.state.error, isNotNull);
    });

    test('deleteMessage sets error on API failure', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-4')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Server error');
      };

      final result = await notifier.deleteMessage('msg-4');
      expect(result, isNull);
      expect(notifier.state.error, isNotNull);
    });
  });
}
