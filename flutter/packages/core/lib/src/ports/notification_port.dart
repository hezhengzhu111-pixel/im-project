import '../models/result.dart';

abstract class NotificationPort {
  /// 请求通知权限
  Future<Result<bool>> requestPermission();

  /// 发送本地通知
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  });
}
