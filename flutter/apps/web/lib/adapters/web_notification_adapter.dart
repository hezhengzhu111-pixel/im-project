import 'package:im_core/core.dart';

class WebNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    try {
      // Web 平台使用 Notification API
      // 实际实现需要通过 dart:js_interop 桥接
      return const Success(false);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
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

      // 实际实现需要通过 dart:js_interop 创建浏览器通知
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }
}
