import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:im_core/core.dart';

class DesktopNotificationAdapter implements NotificationPort {
  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

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
    try {
      if (!_initialized) {
        await _initialize();
      }

      const androidDetails = AndroidNotificationDetails(
        'im_desktop',
        'IM Desktop',
        channelDescription: 'IM Desktop Notifications',
        importance: Importance.high,
        priority: Priority.high,
      );
      const details = NotificationDetails(android: androidDetails);

      await _notifications.show(
        DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title,
        body,
        details,
        payload: payload,
      );

      return const Success(null);
    } catch (e) {
      return Failure(UnknownError('notification_failed'));
    }
  }

  Future<void> _initialize() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidSettings);
    await _notifications.initialize(settings);
    _initialized = true;
  }
}
