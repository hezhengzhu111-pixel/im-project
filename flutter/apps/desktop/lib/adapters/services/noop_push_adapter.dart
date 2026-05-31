import 'package:im_core/core.dart';

/// Desktop adapter for push notifications. Currently Noop.
/// Desktop does not support push notifications.
class NoopPushAdapter implements PushPort {
  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => const Stream.empty();
}
