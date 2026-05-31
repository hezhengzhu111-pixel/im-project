import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

/// Desktop storage adapter using [SharedPreferences] for persistent key-value
/// storage across app sessions.
class DesktopStorageService implements StoragePort {
  late final SharedPreferences _prefs;

  DesktopStorageService._(this._prefs);

  /// Creates a [DesktopStorageService] backed by [SharedPreferences].
  ///
  /// Must be awaited because [SharedPreferences.getInstance] is async.
  static Future<DesktopStorageService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return DesktopStorageService._(prefs);
  }

  @override
  Future<String?> getString(String key) async {
    return _prefs.getString(key);
  }

  @override
  Future<void> setString(String key, String value) async {
    await _prefs.setString(key, value);
  }

  @override
  Future<void> remove(String key) async {
    await _prefs.remove(key);
  }

  @override
  Future<void> clear() async {
    await _prefs.clear();
  }

  @override
  Future<bool> containsKey(String key) async {
    return _prefs.containsKey(key);
  }
}

/// Desktop secure storage adapter using [FlutterSecureStorage] for
/// encrypting sensitive data (e.g. tokens, keys) at rest.
class DesktopSecureStorageAdapter implements SecureStoragePort {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) async {
    return await _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  @override
  Future<void> delete(String key) async {
    await _storage.delete(key: key);
  }

  @override
  Future<void> deleteAll() async {
    await _storage.deleteAll();
  }

  @override
  Future<bool> containsKey(String key) async {
    return await _storage.containsKey(key: key);
  }
}
