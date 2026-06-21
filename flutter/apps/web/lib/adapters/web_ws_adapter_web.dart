// ignore_for_file: deprecated_member_use

import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:math';
import 'package:im_core/core.dart';
import '../core/logging/app_logger.dart';

class WebWsEvent implements WsEvent {
  WebWsEvent({required this.type, required this.data, required this.timestamp});
  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp;

  factory WebWsEvent.fromJson(Map<String, dynamic> json) {
    return WebWsEvent(
      type: json['type'] as String? ?? 'unknown',
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp:
          json['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

typedef WsTicketProvider = Future<String?> Function();

class WebWsClient implements WsClientPort {
  WebWsClient({
    required this.ticketUrl,
    required this.wsBaseUrl,
    WsTicketProvider? ticketProvider,
  }) : _ticketProvider = ticketProvider;

  final String ticketUrl;
  final String wsBaseUrl;
  final WsTicketProvider? _ticketProvider;

  html.WebSocket? _socket;
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

  StreamSubscription? _onOpenSub;
  StreamSubscription? _onMessageSub;
  StreamSubscription? _onCloseSub;
  StreamSubscription? _onErrorSub;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _stateController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  Future<void> connect(String url) async {
    final normalizedUrl = _normalizeWebSocketUrl(url);
    _lastUrl = normalizedUrl;
    _lastUserId = _extractUserId(normalizedUrl) ?? _lastUserId;
    _manualDisconnect = false;
    _updateState(WsConnectionState.connecting);

    try {
      _onOpenSub?.cancel();
      _onMessageSub?.cancel();
      _onCloseSub?.cancel();
      _onErrorSub?.cancel();

      _socket?.close();
      _socket = html.WebSocket(normalizedUrl);
      _onOpenSub = _socket!.onOpen.listen(_onOpen);
      _onMessageSub = _socket!.onMessage.listen(_onMessage);
      _onCloseSub = _socket!.onClose.listen(_onClose);
      _onErrorSub = _socket!.onError.listen(_onError);
    } catch (e) {
      _updateState(WsConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  @override
  Future<void> disconnect() async {
    _manualDisconnect = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _socket?.close();
    _socket = null;
    _isConnected = false;
    _retryCount = 0;
    _updateState(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    _socket?.close();
    _socket = null;
    _isConnected = false;
    _retryCount = 0;
    _manualDisconnect = false;
    await _reconnectWithFreshTicket();
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_isConnected && _socket != null) {
      _socket!.send(jsonEncode(message));
    } else {
      AppLogger.instance.warn('WS send dropped: not connected');
    }
  }

  void _onOpen(html.Event event) {
    _isConnected = true;
    _retryCount = 0;
    _updateState(WsConnectionState.connected);
    _startHeartbeat();
  }

  void _onMessage(html.MessageEvent event) {
    try {
      final data = jsonDecode(event.data as String) as Map<String, dynamic>;
      if (_isHeartbeatPong(data)) {
        _heartbeatTimeoutTimer?.cancel();
        return;
      }
      final wsEvent = WebWsEvent.fromJson(data);
      _eventsController.add(wsEvent);

      // Reset heartbeat timeout on any message (acts as pong)
      _heartbeatTimeoutTimer?.cancel();
    } catch (e, st) {
      AppLogger.instance.error('WS parse error', e, st, 'ws');
    }
  }

  void _onClose(html.CloseEvent event) {
    _isConnected = false;
    _stopHeartbeat();
    _updateState(WsConnectionState.disconnected);
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  void _onError(html.Event event) {
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
        _socket?.close();
      });
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimeoutTimer?.cancel();
  }

  void _scheduleReconnect() {
    if (_manualDisconnect) return;
    if (_retryCount >= _maxRetries) {
      AppLogger.instance.warn(
        'WS reached max reconnection attempts ($_maxRetries)',
      );
      _updateState(WsConnectionState.failed);
      return;
    }
    _updateState(WsConnectionState.reconnecting);

    final baseSeconds = (1 << _retryCount).clamp(1, 30);
    final jitterMs = Random().nextInt(1000);
    final delay = Duration(seconds: baseSeconds, milliseconds: jitterMs);
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
      } catch (e, st) {
        AppLogger.instance.error('WS ticket refresh failed', e, st, 'ws');
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
    return _normalizeWebSocketUrl(
      '$base/${Uri.encodeComponent(userId)}'
      '?${WsEndpoints.ticketParam}=${Uri.encodeQueryComponent(ticket)}',
    );
  }

  String? _extractUserId(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.pathSegments.isEmpty) return null;
    return Uri.decodeComponent(uri.pathSegments.last);
  }

  String _normalizeWebSocketUrl(String url) {
    final uri = Uri.parse(url);
    if (uri.hasScheme) {
      if (uri.scheme == 'http' || uri.scheme == 'https') {
        return uri
            .replace(scheme: uri.scheme == 'https' ? 'wss' : 'ws')
            .toString();
      }
      return uri.toString();
    }

    final location = html.window.location;
    final scheme = location.protocol == 'https:' ? 'wss' : 'ws';
    final host = location.host;
    final path = url.startsWith('/') ? url : '/$url';
    return '$scheme://$host$path';
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
    _manualDisconnect = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _onOpenSub?.cancel();
    _onMessageSub?.cancel();
    _onCloseSub?.cancel();
    _onErrorSub?.cancel();
    _socket?.close();
    _eventsController.close();
    _stateController.close();
  }
}
