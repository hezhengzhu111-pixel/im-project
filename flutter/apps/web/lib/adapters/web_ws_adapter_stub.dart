import 'dart:async';
import 'package:im_core/core.dart';

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
  });

  final String ticketUrl;
  final String wsBaseUrl;

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
  Future<void> connect(String url) async {
    _stateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> disconnect() async {
    _isConnected = false;
    _stateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}

  void dispose() {
    _eventsController.close();
    _stateController.close();
  }
}
