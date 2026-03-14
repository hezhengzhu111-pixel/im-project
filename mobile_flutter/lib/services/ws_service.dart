import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/app_config.dart';

typedef WsMessageHandler = void Function(Map<String, dynamic> payload);
typedef WsStateHandler = void Function(String state);

class WsService {
  WsService({
    required this.userId,
    required this.token,
    required this.onMessage,
    required this.onStateChanged,
  });

  final String userId;
  final String token;
  final WsMessageHandler onMessage;
  final WsStateHandler onStateChanged;

  WebSocketChannel? _channel;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  int _reconnectCount = 0;
  bool _manualClose = false;

  bool get connected => _channel != null;

  void connect() {
    if (_channel != null) return;
    final uri = Uri.parse('${AppConfig.wsBaseUrl}/$userId?token=${Uri.encodeComponent(token)}');
    _manualClose = false;
    onStateChanged('connecting');
    _channel = WebSocketChannel.connect(uri);
    onStateChanged('connected');
    _channel!.stream.listen(
      (event) {
        final data = jsonDecode(event.toString());
        if (data is Map<String, dynamic>) {
          onMessage(data);
        } else if (data is Map) {
          onMessage(data.cast<String, dynamic>());
        }
      },
      onDone: _handleClosed,
      onError: (_) => _handleClosed(),
      cancelOnError: true,
    );
    _startHeartbeat();
    _reconnectCount = 0;
  }

  void disconnect() {
    _manualClose = true;
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    onStateChanged('disconnected');
  }

  void forceReconnect() {
    _manualClose = false;
    _channel?.sink.close();
    _channel = null;
    _reconnectCount = 0;
    onStateChanged('reconnecting');
    connect();
  }

  void send(Map<String, dynamic> payload) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode(payload));
  }

  void _handleClosed() {
    _heartbeatTimer?.cancel();
    _channel = null;
    onStateChanged('disconnected');
    if (_manualClose) return;
    if (_reconnectCount >= 5) return;
    _reconnectCount += 1;
    onStateChanged('reconnecting');
    final delay = Duration(milliseconds: 1000 * _reconnectCount);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, connect);
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      send({
        'type': 'HEARTBEAT',
        'data': {'timestamp': DateTime.now().millisecondsSinceEpoch},
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
    });
  }
}
