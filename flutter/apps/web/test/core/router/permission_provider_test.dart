import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/permission_provider.dart';

class MockPermissionApi implements PermissionApi {
  List<String> permissionsToReturn = [];
  Exception? errorToThrow;

  @override
  Future<List<String>> fetchPermissions() async {
    if (errorToThrow != null) throw errorToThrow!;
    return permissionsToReturn;
  }
}

void main() {
  late MockPermissionApi mockApi;
  late PermissionNotifier notifier;

  setUp(() {
    mockApi = MockPermissionApi();
    notifier = PermissionNotifier(mockApi);
  });

  group('PermissionNotifier', () {
    test('initial state has empty permissions', () {
      expect(notifier.state.permissions, isEmpty);
      expect(notifier.state.isLoading, isFalse);
    });

    test('loadPermissions sets permissions on success', () async {
      mockApi.permissionsToReturn = ['chat:read', 'chat:write'];

      await notifier.loadPermissions();

      expect(notifier.state.permissions, containsAll(['chat:read', 'chat:write']));
      expect(notifier.state.isLoading, isFalse);
    });

    test('loadPermissions resets on error', () async {
      mockApi.errorToThrow = Exception('Network error');

      await notifier.loadPermissions();

      expect(notifier.state.permissions, isEmpty);
      expect(notifier.state.isLoading, isFalse);
    });

    test('hasPermission returns true for existing permission', () async {
      mockApi.permissionsToReturn = ['log:read'];
      await notifier.loadPermissions();

      expect(notifier.hasPermission('log:read'), isTrue);
    });

    test('hasPermission returns false for missing permission', () async {
      mockApi.permissionsToReturn = [];
      await notifier.loadPermissions();

      expect(notifier.hasPermission('log:read'), isFalse);
    });
  });
}
