import 'dart:async';

import 'package:im_core/core.dart';

/// Noop WebSocket client adapter for desktop.
///
/// Provides a stub implementation of [WsClientPort] so the auth module
/// can compile and run without a real WebSocket connection. Replace with
/// a dart:io-based WebSocket client when real-time messaging is needed.
class DesktopWsAdapter implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _stateController = StreamController<WsConnectionState>.broadcast();

  bool _isConnected = false;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _stateController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  String get wsBaseUrl => 'ws://localhost:8082/ws';

  @override
  Future<void> connect(String url) async {
    // Stub: mark as connected for auth flow to proceed.
    _isConnected = true;
    _stateController.add(WsConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    _isConnected = false;
    _stateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    // Noop in stub implementation.
  }

  @override
  void send(Map<String, dynamic> message) {
    // Noop in stub implementation.
  }

  void dispose() {
    _eventsController.close();
    _stateController.close();
  }
}
