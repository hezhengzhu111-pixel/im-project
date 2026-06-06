/// Abstract interface for E2EE key material storage.
///
/// Platform-specific implementations (IndexedDB on web, SharedPreferences on
/// desktop) must conform to this contract.
abstract class E2eeKeyStore {
  Future<void> init();

  Future<void> saveKeyMaterial(String base64Bundle);
  Future<String?> getKeyMaterial();

  Future<void> markOneTimePreKeyConsumed(int oneTimePreKeyId);

  Future<void> saveDeviceId(String deviceId);
  Future<String?> getDeviceId();

  Future<void> savePublicBundle(String bundleJson);
  Future<String?> getPublicBundle();

  Future<void> clearKeyMaterial();
  Future<void> clearAll();

  void dispose();
}
