import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'package:im_core/core.dart';

class WebWsEvent implements WsEvent {
  WebWsEvent({
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
}

class WebWsClient implements WsClientPort {
  html.WebSocket? _socket;
  final _eventsController = StreamController<WsEvent>.broadcast();
  bool _isConnected = false;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  Future<void> connect(String url) async {
    _socket = html.WebSocket(url);

    _socket!.onOpen.listen((_) {
      _isConnected = true;
    });

    _socket!.onMessage.listen((event) {
      try {
        final data =
            jsonDecode(event.data as String) as Map<String, dynamic>;
        _eventsController.add(WebWsEvent(
          type: data['type'] as String,
          data: data['data'] as Map<String, dynamic>,
          timestamp: data['timestamp'] as int,
        ));
      } catch (_) {}
    });

    _socket!.onClose.listen((_) {
      _isConnected = false;
    });

    _socket!.onError.listen((_) {
      _isConnected = false;
    });
  }

  @override
  Future<void> disconnect() async {
    _socket?.close();
    _isConnected = false;
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_isConnected) {
      _socket?.send(jsonEncode(message));
    }
  }
}
