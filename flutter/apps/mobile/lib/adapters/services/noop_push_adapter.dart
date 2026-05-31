import 'package:im_core/core.dart';

/// Mobile adapter for push notifications. Currently Noop.
/// Replace with FCM/APNs SDK when ready.
class NoopPushAdapter implements PushPort {
  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => const Stream.empty();
}
