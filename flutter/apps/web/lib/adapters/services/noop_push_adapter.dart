import 'dart:async';
import 'package:im_core/core.dart';

/// Web adapter for push notifications. Currently Noop.
/// Replace with Web Push API or FCM SDK when ready.
class NoopPushAdapter implements PushPort {
  final _controller = StreamController<PushMessage>.broadcast();

  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => _controller.stream;

  void dispose() => _controller.close();
}
