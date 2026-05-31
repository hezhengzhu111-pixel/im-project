import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'e2ee_session_store.dart';

/// Desktop implementation of [E2eeSessionStore] using [SharedPreferences].
///
/// Stores E2EE ratchet session states as v3 envelope JSON strings.
/// Mirrors the web IndexedDB implementation but uses platform-appropriate
/// persistent key-value storage.
class DesktopSessionStore implements E2eeSessionStore {
  late SharedPreferences _prefs;

  static const _sessionStateEnvelopeVersion = 3;
  static const _sessionStateAlgorithm = 'rust-x25519-x3dh-dr-v1';
  static const _kPrefix = 'e2ee_session_';

  @override
  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // ---------------------------------------------------------------------------
  // Save session (v3 envelope)
  // ---------------------------------------------------------------------------

  @override
  Future<void> saveSession({
    required String sessionId,
    required String stateBase64,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    String direction = 'outbound',
  }) async {
    if (sessionId.isEmpty) throw Exception('E2EE session requires sessionId');
    if (localDeviceId.isEmpty) {
      throw Exception('E2EE session requires localDeviceId');
    }
    if (remoteDeviceId.isEmpty) {
      throw Exception('E2EE session requires remoteDeviceId');
    }

    final resolvedRemoteUserId =
        remoteUserId.isNotEmpty ? remoteUserId : remoteDeviceId;
    if (resolvedRemoteUserId.isEmpty) {
      throw Exception('E2EE session requires remoteUserId');
    }

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final remoteUserIdHash = _fingerprint(resolvedRemoteUserId);

    final envelope = {
      'version': _sessionStateEnvelopeVersion,
      'algorithm': _sessionStateAlgorithm,
      'userId': localDeviceId,
      'localDeviceId': localDeviceId,
      'sessionId': sessionId,
      'remoteUserIdHash': remoteUserIdHash,
      'remoteDeviceId': remoteDeviceId,
      'createdAt': timestamp,
      'updatedAt': timestamp,
      'state': stateBase64,
      'direction': direction,
    };

    await _prefs.setString('$_kPrefix$sessionId', jsonEncode(envelope));
  }

  // ---------------------------------------------------------------------------
  // Get session (with v3 envelope validation)
  // ---------------------------------------------------------------------------

  @override
  Future<String?> getSession({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async {
    final raw = _prefs.getString('$_kPrefix$sessionId');
    if (raw == null) return null;

    try {
      final stored = jsonDecode(raw) as Map<String, dynamic>;

      // Validate v3 envelope
      if (stored['version'] != _sessionStateEnvelopeVersion) return null;
      if (stored['algorithm'] != _sessionStateAlgorithm) return null;

      // Validate context
      final storedUserId = stored['userId'] as String? ?? '';
      final storedLocalDeviceId = stored['localDeviceId'] as String? ?? '';
      final storedSessionId = stored['sessionId'] as String? ?? '';
      final storedRemoteDeviceId = stored['remoteDeviceId'] as String? ?? '';
      final storedRemoteUserIdHash =
          stored['remoteUserIdHash'] as String? ?? '';

      final resolvedRemoteUserId =
          remoteUserId.isNotEmpty ? remoteUserId : remoteDeviceId;

      if (storedUserId != localDeviceId) return null;
      if (storedLocalDeviceId != localDeviceId) return null;
      if (storedSessionId != sessionId) return null;
      if (storedRemoteDeviceId != remoteDeviceId) return null;

      final expectedHash = _fingerprint(resolvedRemoteUserId);
      if (storedRemoteUserIdHash != expectedHash) return null;

      return stored['state'] as String?;
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Find session by local device (fallback)
  // ---------------------------------------------------------------------------

  @override
  Future<SessionLookupResult?> findSessionByLocalDevice({
    required String sessionId,
    required String localDeviceId,
  }) async {
    final raw = _prefs.getString('$_kPrefix$sessionId');
    if (raw == null) return null;

    try {
      final stored = jsonDecode(raw) as Map<String, dynamic>;
      if (stored['version'] != _sessionStateEnvelopeVersion) return null;

      final storedUserId = stored['userId'] as String? ?? '';
      final storedLocalDeviceId = stored['localDeviceId'] as String? ?? '';
      final storedSessionId = stored['sessionId'] as String? ?? '';

      if (storedUserId != localDeviceId ||
          storedLocalDeviceId != localDeviceId ||
          storedSessionId != sessionId) {
        return null;
      }

      final stateBase64 = stored['state'] as String?;
      final remoteDeviceId = stored['remoteDeviceId'] as String? ?? '';

      if (stateBase64 == null || stateBase64.isEmpty) return null;

      return SessionLookupResult(
        stateBase64: stateBase64,
        remoteDeviceId: remoteDeviceId,
      );
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Delete / Clear
  // ---------------------------------------------------------------------------

  @override
  Future<void> deleteSession(String sessionId) async {
    await _prefs.remove('$_kPrefix$sessionId');
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
  // Helpers
  // ---------------------------------------------------------------------------

  static String _fingerprint(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString().substring(0, 16);
  }
}
