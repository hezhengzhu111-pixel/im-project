import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:im_core/core.dart';

/// Desktop WebSocket client adapter using dart:io.
///
/// Provides a real WebSocket connection for desktop platforms with
/// automatic reconnection, message streaming, and connection state management.
class DesktopWsAdapter implements WsClientPort {
  WebSocket? _socket;
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _stateController = StreamController<WsConnectionState>.broadcast();

  WsConnectionState _connectionState = WsConnectionState.disconnected;
  Timer? _reconnectTimer;
  String? _currentUrl;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _stateController.stream;

  @override
  bool get isConnected => _connectionState == WsConnectionState.connected;

  @override
  String get wsBaseUrl => _currentUrl ?? 'ws://localhost:8082/ws';

  @override
  Future<void> connect(String url) async {
    if (_connectionState == WsConnectionState.connected ||
        _connectionState == WsConnectionState.connecting) {
      return;
    }

    _currentUrl = url;
    _updateConnectionState(WsConnectionState.connecting);

    try {
      // Establish WebSocket connection
      final uri = Uri.parse(url);
      _socket = await WebSocket.connect(uri.toString());

      _updateConnectionState(WsConnectionState.connected);

      // Listen for messages
      _socket!.listen(
        (data) {
          try {
            final json = jsonDecode(data as String) as Map<String, dynamic>;
            _eventsController.add(_WsEventImpl.fromJson(json));
          } catch (e) {
            // Ignore parse errors
          }
        },
        onDone: () {
          _updateConnectionState(WsConnectionState.disconnected);
          _scheduleReconnect();
        },
        onError: (error) {
          _updateConnectionState(WsConnectionState.disconnected);
          _scheduleReconnect();
        },
      );
    } catch (e) {
      _updateConnectionState(WsConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  @override
  Future<void> disconnect() async {
    _reconnectTimer?.cancel();
    _socket?.close();
    _socket = null;
    _currentUrl = null;
    _updateConnectionState(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    if (_currentUrl != null) {
      await disconnect();
      await connect(_currentUrl!);
    }
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_socket == null || !isConnected) {
      throw StateError('WebSocket is not connected');
    }

    _socket!.add(jsonEncode(message));
  }

  void _updateConnectionState(WsConnectionState state) {
    _connectionState = state;
    _stateController.add(state);
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (_currentUrl != null) {
        _updateConnectionState(WsConnectionState.reconnecting);
        connect(_currentUrl!);
      }
    });
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _socket?.close();
    _eventsController.close();
    _stateController.close();
  }
}

/// Implementation of WsEvent.
class _WsEventImpl implements WsEvent {
  @override
  final String type;

  @override
  final Map<String, dynamic> data;

  @override
  final int timestamp;

  _WsEventImpl({
    required this.type,
    required this.data,
    required this.timestamp,
  });

  factory _WsEventImpl.fromJson(Map<String, dynamic> json) {
    return _WsEventImpl(
      type: json['type'] as String? ?? 'unknown',
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp: json['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}
