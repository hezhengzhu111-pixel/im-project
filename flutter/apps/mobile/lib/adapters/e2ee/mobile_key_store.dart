import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:im_shared_features/e2ee.dart';

/// Mobile implementation of [E2eeKeyStore] using [FlutterSecureStorage].
///
/// Uses OS-level secure storage (Keychain on iOS, Android Keystore) to protect
/// E2EE key material. This is more secure than SharedPreferences which stores
/// data in plaintext.
class MobileKeyStore implements E2eeKeyStore {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  @override
  Future<void> init() async {
    // FlutterSecureStorage requires no explicit initialization.
  }

  // ---------------------------------------------------------------------------
  // Key Material
  // ---------------------------------------------------------------------------

  @override
  Future<void> saveKeyMaterial(String base64Bundle) async {
    await _storage.write(key: _kKeyMaterial, value: base64Bundle);
  }

  @override
  Future<String?> getKeyMaterial() async {
    return _storage.read(key: _kKeyMaterial);
  }

  @override
  Future<void> markOneTimePreKeyConsumed(int oneTimePreKeyId) async {
    final raw = await getKeyMaterial();
    if (raw == null) return;

    final keyMaterial = jsonDecode(raw) as Map<String, dynamic>;

    // Remove from otk_pairs
    final otkPairs = keyMaterial['otk_pairs'] as List<dynamic>? ?? [];
    keyMaterial['otk_pairs'] = otkPairs
        .where((otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId)
        .toList();

    // Remove from public_bundle.one_time_pre_keys
    final publicBundle = keyMaterial['public_bundle'] as Map<String, dynamic>?;
    if (publicBundle != null) {
      final otkList = publicBundle['one_time_pre_keys'] as List<dynamic>? ?? [];
      publicBundle['one_time_pre_keys'] = otkList
          .where(
              (otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId)
          .toList();
    }

    await saveKeyMaterial(jsonEncode(keyMaterial));
  }

  // ---------------------------------------------------------------------------
  // Device ID
  // ---------------------------------------------------------------------------

  @override
  Future<void> saveDeviceId(String deviceId) async {
    await _storage.write(key: _kDeviceId, value: deviceId);
  }

  @override
  Future<String?> getDeviceId() async {
    return _storage.read(key: _kDeviceId);
  }

  // ---------------------------------------------------------------------------
  // Public Bundle
  // ---------------------------------------------------------------------------

  @override
  Future<void> savePublicBundle(String bundleJson) async {
    await _storage.write(key: _kPublicBundle, value: bundleJson);
  }

  @override
  Future<String?> getPublicBundle() async {
    return _storage.read(key: _kPublicBundle);
  }

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  @override
  Future<void> clearKeyMaterial() async {
    await _storage.delete(key: _kKeyMaterial);
    await _storage.delete(key: _kPublicBundle);
  }

  @override
  Future<void> clearAll() async {
    await _storage.delete(key: _kKeyMaterial);
    await _storage.delete(key: _kDeviceId);
    await _storage.delete(key: _kPublicBundle);
  }

  @override
  void dispose() {
    // FlutterSecureStorage does not require explicit disposal.
  }

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  static const _kKeyMaterial = 'e2ee_key_material';
  static const _kDeviceId = 'e2ee_key_device_id';
  static const _kPublicBundle = 'e2ee_key_public_bundle';
}
