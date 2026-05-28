import 'package:im_core/core.dart';

class MockNotificationAdapter implements NotificationPort {
  bool _hasPermission = false;
  FailureError? _mockError;

  void setPermission(bool hasPermission) {
    _hasPermission = hasPermission;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
  }

  @override
  Future<Result<bool>> requestPermission() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    return Success(_hasPermission);
  }

  @override
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  }) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (!_hasPermission) {
      return const Failure(PermissionDenied('notification'));
    }
    return const Success(null);
  }
}
