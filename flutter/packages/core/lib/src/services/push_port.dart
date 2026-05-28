import 'models.dart';

export 'models.dart' show PushMessage;

/// Abstract port for push notification services.
///
/// Implementations should handle platform-specific push registration
/// (e.g., Web Push API, FCM, APNs).
abstract class PushPort {
  /// Subscribe to push notifications.
  /// Returns the device token, or null if subscription failed.
  Future<String?> subscribe();

  /// Unsubscribe from push notifications.
  Future<void> unsubscribe();

  /// Stream of incoming push messages.
  Stream<PushMessage> get onMessage;
}

/// Noop implementation that never subscribes and never receives messages.
class NoopPushPort implements PushPort {
  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => const Stream.empty();
}
