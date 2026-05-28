import 'package:im_core/core.dart';

/// Web adapter for push notifications. Currently Noop.
/// Replace with Web Push API or FCM SDK when ready.
class NoopPushAdapter implements PushPort {
  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => const Stream.empty();
}
