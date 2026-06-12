import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_shared_features/e2ee.dart';

/// Desktop implementation of [E2eeKeyStore] using [FlutterSecureStorage].
///
/// Replaces the SharedPreferences implementation with OS-level secure
/// storage (Keychain on macOS, libsecret on Linux, Windows Credential
/// Manager on Windows) so that E2EE key material is never stored in
/// plaintext files on disk.
class DesktopKeyStore implements E2eeKeyStore {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  @override
  Future<void> init() async {
    // FlutterSecureStorage requires no explicit initialisation.
  }

  // ---------------------------------------------------------------------------
  // Key Material
  // ---------------------------------------------------------------------------

  @override
  Future<void> saveKeyMaterial(String base64Bundle) async {
    await _storage.write(key: _kKeyMaterial, value: base64Bundle);
  }

  @override
  Future<String?> getKeyMaterial() => _storage.read(key: _kKeyMaterial);

  @override
  Future<void> markOneTimePreKeyConsumed(int oneTimePreKeyId) async {
    final raw = await getKeyMaterial();
    if (raw == null) return;

    final keyMaterial = jsonDecode(raw) as Map<String, dynamic>;

    // Remove from otk_pairs
    final otkPairs = keyMaterial['otk_pairs'] as List<dynamic>? ?? [];
    keyMaterial['otk_pairs'] = otkPairs
        .where(
          (otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId,
        )
        .toList();

    // Remove from public_bundle.one_time_pre_keys
    final publicBundle = keyMaterial['public_bundle'] as Map<String, dynamic>?;
    if (publicBundle != null) {
      final otkList = publicBundle['one_time_pre_keys'] as List<dynamic>? ?? [];
      publicBundle['one_time_pre_keys'] = otkList
          .where(
            (otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId,
          )
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
  Future<String?> getDeviceId() => _storage.read(key: _kDeviceId);

  // ---------------------------------------------------------------------------
  // Public Bundle
  // ---------------------------------------------------------------------------

  @override
  Future<void> savePublicBundle(String bundleJson) async {
    await _storage.write(key: _kPublicBundle, value: bundleJson);
  }

  @override
  Future<String?> getPublicBundle() => _storage.read(key: _kPublicBundle);

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
    // Delete only our own keys to avoid wiping unrelated entries.
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

  static const _kPrefix = 'e2ee_key_';
  static const _kKeyMaterial = '${_kPrefix}material';
  static const _kDeviceId = '${_kPrefix}device_id';
  static const _kPublicBundle = '${_kPrefix}public_bundle';
}
