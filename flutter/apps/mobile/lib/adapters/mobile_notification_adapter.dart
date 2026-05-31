import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:im_core/core.dart';

/// Mobile notification adapter using flutter_local_notifications.
class MobileNotificationAdapter implements NotificationPort {
  MobileNotificationAdapter() {
    _init();
  }

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _init() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _plugin.initialize(settings);
    _initialized = true;
  }

  @override
  Future<Result<bool>> requestPermission() async {
    try {
      // Android 13+ requires explicit notification permission.
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        final granted = await android.requestNotificationsPermission();
        return Success(granted ?? false);
      }

      // iOS always requests via the initialization settings.
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      if (ios != null) {
        final granted = await ios.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
        return Success(granted ?? false);
      }

      // Other platforms default to granted.
      return const Success(true);
    } catch (e) {
      return const Failure(UnknownError('notification_permission_failed'));
    }
  }

  @override
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  }) async {
    try {
      if (!_initialized) {
        await _init();
      }

      const androidDetails = AndroidNotificationDetails(
        'im_default',
        'IM Messages',
        channelDescription: 'Incoming message notifications',
        importance: Importance.high,
        priority: Priority.high,
      );
      const iosDetails = DarwinNotificationDetails();
      const details = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );

      await _plugin.show(
        DateTime.now().millisecondsSinceEpoch.remainder(100000),
        title,
        body,
        details,
        payload: payload,
      );

      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('notification_show_failed'));
    }
  }
}
