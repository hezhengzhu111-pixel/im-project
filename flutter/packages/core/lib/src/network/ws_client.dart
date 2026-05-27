import 'dart:async';

/// Represents an event received over a WebSocket connection.
abstract class WsEvent {
  String get type;
  Map<String, dynamic> get data;
  int get timestamp;
}

/// Abstract port for WebSocket client operations.
///
/// Platform-specific implementations should handle connection lifecycle,
/// message serialization, and event stream management.
abstract class WsClientPort {
  /// Stream of events received from the WebSocket server.
  Stream<WsEvent> get events;

  /// Whether the WebSocket connection is currently active.
  bool get isConnected;

  /// Establishes a WebSocket connection to the given [url].
  Future<void> connect(String url);

  /// Closes the WebSocket connection.
  Future<void> disconnect();

  /// Sends a JSON message over the WebSocket connection.
  void send(Map<String, dynamic> message);
}
