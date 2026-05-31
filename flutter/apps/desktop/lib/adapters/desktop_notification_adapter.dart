import 'package:im_core/core.dart';

/// Desktop notification adapter.
///
/// This is a placeholder implementation for the framework skeleton.
/// Replace with `flutter_local_notifications` for production use.
class DesktopNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    // Desktop platforms generally don't require explicit notification
    // permissions, so we always return true.
    return const Success(true);
  }

  @override
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  }) async {
    // TODO: Implement using flutter_local_notifications or similar.
    return const Success(null);
  }
}
