import 'package:im_core/core.dart';

/// Desktop storage adapter using an in-memory map.
///
/// This is a placeholder implementation for the framework skeleton.
/// Replace with a persistent solution (e.g., `shared_preferences` or
/// `hive`) for production use.
class DesktopStorageService implements StoragePort {
  final Map<String, String> _storage = {};

  @override
  Future<String?> getString(String key) async => _storage[key];

  @override
  Future<void> setString(String key, String value) async =>
      _storage[key] = value;

  @override
  Future<void> remove(String key) async => _storage.remove(key);

  @override
  Future<void> clear() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}

/// Desktop secure storage adapter using an in-memory map.
///
/// This is a placeholder implementation for the framework skeleton.
/// Replace with `flutter_secure_storage` or platform-native secure storage
/// for production use.
class DesktopSecureStorageAdapter implements SecureStoragePort {
  final Map<String, String> _storage = {};

  @override
  Future<String?> read(String key) async => _storage[key];

  @override
  Future<void> write(String key, String value) async =>
      _storage[key] = value;

  @override
  Future<void> delete(String key) async => _storage.remove(key);

  @override
  Future<void> deleteAll() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}
