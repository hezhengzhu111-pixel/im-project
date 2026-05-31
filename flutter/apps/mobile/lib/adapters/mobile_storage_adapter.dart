import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

/// Mobile storage adapter using FlutterSecureStorage for both general
/// and secure storage. On native mobile, this maps to iOS Keychain and
/// Android KeyStore respectively.
class MobileStorageService implements StoragePort {
  MobileStorageService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> getString(String key) => _storage.read(key: key);

  @override
  Future<void> setString(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> remove(String key) => _storage.delete(key: key);

  @override
  Future<void> clear() => _storage.deleteAll();

  @override
  Future<bool> containsKey(String key) => _storage.containsKey(key: key);
}

/// Mobile secure storage adapter for sensitive data (tokens, keys).
class MobileSecureStorageAdapter implements SecureStoragePort {
  MobileSecureStorageAdapter({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);

  @override
  Future<void> deleteAll() => _storage.deleteAll();

  @override
  Future<bool> containsKey(String key) => _storage.containsKey(key: key);
}
