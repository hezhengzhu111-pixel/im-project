/// Abstract port for secure storage of sensitive data (tokens, keys, etc.).
///
/// Platform-specific implementations should use OS-level secure storage
/// (e.g., Keychain for iOS, KeyStore for Android, flutter_secure_storage for web).
abstract class SecureStoragePort {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
  Future<void> deleteAll();
  Future<bool> containsKey(String key);
}
