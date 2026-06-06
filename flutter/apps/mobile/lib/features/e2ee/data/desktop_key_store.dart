import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:im_shared_features/src/e2ee/data/e2ee_key_store.dart';

/// Desktop implementation of [E2eeKeyStore] using [SharedPreferences].
///
/// Replaces the web IndexedDB implementation with a simple key-value store
/// that persists across app sessions on desktop.
class DesktopKeyStore implements E2eeKeyStore {
  late SharedPreferences _prefs;

  @override
  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // ---------------------------------------------------------------------------
  // Key Material
  // ---------------------------------------------------------------------------

  @override
  Future<void> saveKeyMaterial(String base64Bundle) async {
    await _prefs.setString(_kKeyMaterial, base64Bundle);
  }

  @override
  Future<String?> getKeyMaterial() async {
    return _prefs.getString(_kKeyMaterial);
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
    await _prefs.setString(_kDeviceId, deviceId);
  }

  @override
  Future<String?> getDeviceId() async {
    return _prefs.getString(_kDeviceId);
  }

  // ---------------------------------------------------------------------------
  // Public Bundle
  // ---------------------------------------------------------------------------

  @override
  Future<void> savePublicBundle(String bundleJson) async {
    await _prefs.setString(_kPublicBundle, bundleJson);
  }

  @override
  Future<String?> getPublicBundle() async {
    return _prefs.getString(_kPublicBundle);
  }

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  @override
  Future<void> clearKeyMaterial() async {
    await _prefs.remove(_kKeyMaterial);
    await _prefs.remove(_kPublicBundle);
  }

  @override
  Future<void> clearAll() async {
    final keys = _prefs.getKeys();
    for (final key in keys) {
      if (key.startsWith(_kPrefix)) {
        await _prefs.remove(key);
      }
    }
  }

  @override
  void dispose() {
    // SharedPreferences does not require explicit disposal.
  }

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  static const _kPrefix = 'e2ee_key_';
  static const _kKeyMaterial = '${_kPrefix}material';
  static const _kDeviceId = '${_kPrefix}device_id';
  static const _kPublicBundle = '${_kPrefix}public_bundle';
}
