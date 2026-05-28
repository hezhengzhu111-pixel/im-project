import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_notification_adapter.dart';

void main() {
  group('NotificationPort', () {
    late MockNotificationAdapter adapter;

    setUp(() {
      adapter = MockNotificationAdapter();
    });

    test('requestPermission 成功', () async {
      adapter.setPermission(true);

      final result = await adapter.requestPermission();

      expect(result, isA<Success<bool>>());
      expect((result as Success).data, true);
    });

    test('requestPermission 拒绝', () async {
      adapter.setPermission(false);

      final result = await adapter.requestPermission();

      expect(result, isA<Success<bool>>());
      expect((result as Success).data, false);
    });

    test('showNotification 成功', () async {
      adapter.setPermission(true);

      final result = await adapter.showNotification(title: '测试通知');

      expect(result, isA<Success<void>>());
    });

    test('showNotification 权限被拒绝', () async {
      adapter.setPermission(false);

      final result = await adapter.showNotification(title: '测试通知');

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<PermissionDenied>());
    });

    test('showNotification 发生错误', () async {
      adapter.setMockError(const UnknownError('测试错误'));

      final result = await adapter.showNotification(title: '测试通知');

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });
  });
}
