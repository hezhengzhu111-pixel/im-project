import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
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
      timestamp: json['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

class WebWsClient implements WsClientPort {
  WebWsClient({required this.ticketUrl, required this.wsBaseUrl});

  final String ticketUrl;
  final String wsBaseUrl;

  html.WebSocket? _socket;
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _stateController = StreamController<WsConnectionState>.broadcast();

  bool _isConnected = false;
  bool _manualDisconnect = false;
  int _retryCount = 0;
  static const int _maxRetries = 10;
  static const Duration _heartbeatInterval = Duration(seconds: 30);
  static const Duration _heartbeatTimeout = Duration(seconds: 5);

  Timer? _heartbeatTimer;
  Timer? _heartbeatTimeoutTimer;
  Timer? _reconnectTimer;
  String? _lastUrl;

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
    _lastUrl = url;
    _manualDisconnect = false;
    _updateState(WsConnectionState.connecting);

    try {
      _onOpenSub?.cancel();
      _onMessageSub?.cancel();
      _onCloseSub?.cancel();
      _onErrorSub?.cancel();

      _socket = html.WebSocket(url);
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
    if (_lastUrl != null) {
      await connect(_lastUrl!);
    }
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
      // Start timeout timer
      _heartbeatTimeoutTimer?.cancel();
      _heartbeatTimeoutTimer = Timer(_heartbeatTimeout, () {
        // No pong received, trigger reconnect
        _socket?.close();
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
      if (_lastUrl != null && !_manualDisconnect) {
        connect(_lastUrl!);
      }
    });
  }

  void _updateState(WsConnectionState state) {
    _stateController.add(state);
  }

  void dispose() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _onOpenSub?.cancel();
    _onMessageSub?.cancel();
    _onCloseSub?.cancel();
    _onErrorSub?.cancel();
    _eventsController.close();
    _stateController.close();
    _socket?.close();
  }
}
