import 'dart:async';

import 'package:test/test.dart';
import 'package:im_core/core.dart';

/// Controllable fake for verifying [WsClientPort] event and connection contracts.
class _FakeWsClientPort implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController = StreamController<WsConnectionState>.broadcast();

  final List<Map<String, dynamic>> sent = [];
  String? lastConnectedUrl;
  bool _connected = false;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _connectionStateController.stream;

  @override
  bool get isConnected => _connected;

  @override
  String get wsBaseUrl => 'ws://localhost';

  @override
  Future<void> connect(String url) async {
    lastConnectedUrl = url;
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    _connected = false;
    _connectionStateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    _connectionStateController.add(WsConnectionState.reconnecting);
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  void send(Map<String, dynamic> message) => sent.add(message);

  void addEvent(WsEvent event) => _eventsController.add(event);

  void dispose() {
    _eventsController.close();
    _connectionStateController.close();
  }
}

class _TestWsEvent implements WsEvent {
  _TestWsEvent({required this.type, required this.data, int? timestamp})
      : timestamp = timestamp ?? DateTime.now().millisecondsSinceEpoch;

  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp;
}

void main() {
  group('WsClientPort contract', () {
    late _FakeWsClientPort client;

    setUp(() => client = _FakeWsClientPort());
    tearDown(() => client.dispose());

    test('initially disconnected', () {
      expect(client.isConnected, isFalse);
    });

    test('connect sets isConnected and emits connected state', () async {
      final expectation = expectLater(
        client.connectionState,
        emits(WsConnectionState.connected),
      );
      await client.connect('ws://example.com/ws');
      expect(client.isConnected, isTrue);
      expect(client.lastConnectedUrl, 'ws://example.com/ws');
      await expectation;
    });

    test('disconnect clears isConnected and emits disconnected state', () async {
      await client.connect('ws://example.com/ws');
      final expectation = expectLater(
        client.connectionState,
        emits(WsConnectionState.disconnected),
      );
      await client.disconnect();
      expect(client.isConnected, isFalse);
      await expectation;
    });

    test('send records outgoing messages', () {
      client.send({'type': 'ping'});
      client.send({'type': 'message', 'content': 'hello'});
      expect(client.sent, hasLength(2));
      expect(client.sent.last['type'], 'message');
    });

    test('events stream delivers pushed events', () async {
      final event = _TestWsEvent(type: 'message', data: {'id': 'm1'});
      expect(client.events, emits(event));
      client.addEvent(event);
    });

    test('reconnect emits reconnecting then connected', () async {
      await client.connect('ws://example.com/ws');
      await client.disconnect();

      final states = <WsConnectionState>[];
      final sub = client.connectionState.listen(states.add);
      await client.reconnect();
      await Future<void>.delayed(Duration.zero);

      expect(states, contains(WsConnectionState.reconnecting));
      expect(states, contains(WsConnectionState.connected));
      await sub.cancel();
    });
  });
}
