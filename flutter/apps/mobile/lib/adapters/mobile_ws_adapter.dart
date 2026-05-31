import 'dart:async';
import 'dart:convert';

import 'package:im_core/core.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// WebSocket event implementation for mobile.
class MobileWsEvent implements WsEvent {
  MobileWsEvent({
    required this.type,
    required this.data,
    required this.timestamp,
  });

  @override
  final String type;

  @override
  final Map<String, dynamic> data;

  @override
  final int timestamp;

  factory MobileWsEvent.fromJson(Map<String, dynamic> json) {
    return MobileWsEvent(
      type: json['type'] as String? ?? 'unknown',
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp:
          json['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

typedef WsTicketProvider = Future<String?> Function();

/// Mobile WebSocket client adapter using web_socket_channel.
///
/// On mobile, dart:html is not available, so we use the cross-platform
/// web_socket_channel package instead.
class MobileWsClient implements WsClientPort {
  MobileWsClient({
    required this.ticketUrl,
    required String wsBaseUrl,
    WsTicketProvider? ticketProvider,
  })  : _wsBaseUrl = wsBaseUrl,
        _ticketProvider = ticketProvider;

  final String ticketUrl;
  final String _wsBaseUrl;
  final WsTicketProvider? _ticketProvider;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _stateController = StreamController<WsConnectionState>.broadcast();

  bool _isConnected = false;
  bool _manualDisconnect = false;
  int _retryCount = 0;
  static const int _maxRetries = 10;
  static const Duration _heartbeatInterval = Duration(seconds: 30);
  static const Duration _heartbeatTimeout = Duration(seconds: 15);

  Timer? _heartbeatTimer;
  Timer? _heartbeatTimeoutTimer;
  Timer? _reconnectTimer;
  String? _lastUrl;
  String? _lastUserId;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _stateController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  String get wsBaseUrl => _wsBaseUrl;

  @override
  Future<void> connect(String url) async {
    _lastUrl = url;
    _lastUserId = _extractUserId(url);
    _manualDisconnect = false;
    _updateState(WsConnectionState.connecting);

    try {
      await _subscription?.cancel();
      await _channel?.sink.close();

      _channel = WebSocketChannel.connect(Uri.parse(url));
      _subscription = _channel!.stream.listen(
        _onMessage,
        onDone: _onDone,
        onError: _onError,
      );

      // In web_socket_channel 2.x, the connection is established
      // when connect() is called. Mark as connected immediately.
      _isConnected = true;
      _retryCount = 0;
      _updateState(WsConnectionState.connected);
      _startHeartbeat();
    } catch (e) {
      _isConnected = false;
      _updateState(WsConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  @override
  Future<void> disconnect() async {
    _manualDisconnect = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _retryCount = 0;
    _updateState(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _retryCount = 0;
    _manualDisconnect = false;
    await _reconnectWithFreshTicket();
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_isConnected && _channel != null) {
      _channel!.sink.add(jsonEncode(message));
    }
  }

  void _onMessage(dynamic rawData) {
    try {
      final data = jsonDecode(rawData as String) as Map<String, dynamic>;
      if (_isHeartbeatPong(data)) {
        _heartbeatTimeoutTimer?.cancel();
        return;
      }
      final wsEvent = MobileWsEvent.fromJson(data);
      _eventsController.add(wsEvent);

      // Reset heartbeat timeout on any message (acts as pong).
      _heartbeatTimeoutTimer?.cancel();
    } catch (e) {
      // Log parse errors but don't crash.
    }
  }

  void _onDone() {
    _isConnected = false;
    _stopHeartbeat();
    _updateState(WsConnectionState.disconnected);
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  void _onError(Object error) {
    _isConnected = false;
    _stopHeartbeat();
    _updateState(WsConnectionState.disconnected);
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      send({'type': WsMessageType.heartbeat});
      _heartbeatTimeoutTimer?.cancel();
      _heartbeatTimeoutTimer = Timer(_heartbeatTimeout, () {
        _channel?.sink.close();
      });
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimeoutTimer?.cancel();
  }

  void _scheduleReconnect() {
    if (_manualDisconnect || _retryCount >= _maxRetries) return;
    _updateState(WsConnectionState.reconnecting);

    final delay = Duration(seconds: (1 << _retryCount).clamp(1, 30));
    _retryCount++;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      if (!_manualDisconnect) {
        _reconnectWithFreshTicket();
      }
    });
  }

  Future<void> _reconnectWithFreshTicket() async {
    final userId = _lastUserId;
    final ticketProvider = _ticketProvider;
    if (userId != null && userId.isNotEmpty && ticketProvider != null) {
      try {
        final ticket = await ticketProvider();
        if (ticket != null && ticket.isNotEmpty) {
          await connect(_buildUrl(userId, ticket));
          return;
        }
      } catch (_) {
        // Ticket refresh failed; will fall through to reconnect logic.
      }
      _isConnected = false;
      _updateState(WsConnectionState.disconnected);
      _scheduleReconnect();
      return;
    }
    if (_lastUrl != null) {
      await connect(_lastUrl!);
    }
  }

  String _buildUrl(String userId, String ticket) {
    final base = wsBaseUrl.replaceFirst(RegExp(r'/+$'), '');
    return '$base/${Uri.encodeComponent(userId)}'
        '?${WsEndpoints.ticketParam}=${Uri.encodeQueryComponent(ticket)}';
  }

  String? _extractUserId(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.pathSegments.isEmpty) return null;
    return Uri.decodeComponent(uri.pathSegments.last);
  }

  bool _isHeartbeatPong(Map<String, dynamic> data) {
    final type = data['type']?.toString().toUpperCase();
    final content = data['content']?.toString().toUpperCase();
    return type == WsMessageType.heartbeat && content == 'PONG';
  }

  void _updateState(WsConnectionState state) {
    _stateController.add(state);
  }

  void dispose() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _eventsController.close();
    _stateController.close();
    _channel?.sink.close();
  }
}
