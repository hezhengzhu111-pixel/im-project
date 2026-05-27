/// Abstract port for general-purpose key-value storage.
///
/// Platform-specific implementations should persist data locally
/// (e.g., SharedPreferences for mobile, localStorage for web).
abstract class StoragePort {
  Future<String?> getString(String key);
  Future<void> setString(String key, String value);
  Future<void> remove(String key);
  Future<void> clear();
  Future<bool> containsKey(String key);
}
