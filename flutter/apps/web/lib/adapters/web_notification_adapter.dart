import 'dart:js_interop';

import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    try {
      final permission =
          await web.Notification.requestPermission().toDart;
      return Success(permission.toDart == 'granted');
    } catch (e) {
      return const Failure(
          UnknownError('notification_permission_failed'));
    }
  }

  @override
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  }) async {
    try {
      final permission = await requestPermission();
      if (permission case Success(:final data) when !data) {
        return const Failure(PermissionDenied('notification'));
      }

      if (body != null) {
        web.Notification(title, web.NotificationOptions(body: body));
      } else {
        web.Notification(title);
      }
      return const Success(null);
    } catch (e) {
      return const Failure(
          UnknownError('notification_show_failed'));
    }
  }
}
