import 'dart:math';

import 'package:im_core/core.dart';

/// Stores E2EE ephemeral metadata in SecureStorage.
class E2eeMetaStore {
  E2eeMetaStore(this._storage);

  final SecureStoragePort _storage;

  static const _statusPrefix = 'e2ee:status:';
  static const _remoteDevicePrefix = 'e2ee:remote_device:';
  static const _handshakePrefix = 'e2ee:initial_handshake:';
  static const _verifyPhrasePrefix = 'e2ee:verify_phrase:';
  static const _otkPublishedPrefix = 'e2ee:otk_published:';
  static const _deviceIdKey = 'e2ee_device_id';

  Future<String> getSessionStatus(String sessionId) async {
    return await _storage.read('$_statusPrefix$sessionId') ?? 'plaintext';
  }

  Future<void> setSessionStatus(String sessionId, String status) async {
    await _storage.write('$_statusPrefix$sessionId', status);
  }

  Future<String?> getRemoteDeviceId(String sessionId) async {
    return await _storage.read('$_remoteDevicePrefix$sessionId');
  }

  Future<void> setRemoteDeviceId(String sessionId, String deviceId) async {
    await _storage.write('$_remoteDevicePrefix$sessionId', deviceId);
  }

  Future<String?> getPendingHandshake(String sessionId) async {
    return await _storage.read('$_handshakePrefix$sessionId');
  }

  Future<void> setPendingHandshake(String sessionId, String handshake) async {
    await _storage.write('$_handshakePrefix$sessionId', handshake);
  }

  Future<void> clearPendingHandshake(String sessionId) async {
    await _storage.delete('$_handshakePrefix$sessionId');
  }

  Future<String?> getVerifyPhrase(String sessionId) async {
    return await _storage.read('$_verifyPhrasePrefix$sessionId');
  }

  Future<void> setVerifyPhrase(String sessionId, String phrase) async {
    await _storage.write('$_verifyPhrasePrefix$sessionId', phrase);
  }

  Future<String> getOrCreateDeviceId() async {
    var deviceId = await _storage.read(_deviceIdKey);
    if (deviceId == null) {
      deviceId = _generateUuid();
      await _storage.write(_deviceIdKey, deviceId);
    }
    return deviceId;
  }

  Future<List<int>> getPublishedOtkIds(String deviceId) async {
    final raw = await _storage.read('$_otkPublishedPrefix$deviceId');
    if (raw == null || raw.isEmpty) return [];
    return raw.split(',').map(int.parse).toList();
  }

  Future<void> setPublishedOtkIds(String deviceId, List<int> ids) async {
    await _storage.write('$_otkPublishedPrefix$deviceId', ids.join(','));
  }

  Future<void> clearSession(String sessionId) async {
    await _storage.delete('$_statusPrefix$sessionId');
    await _storage.delete('$_remoteDevicePrefix$sessionId');
    await _storage.delete('$_handshakePrefix$sessionId');
    await _storage.delete('$_verifyPhrasePrefix$sessionId');
  }

  String _generateUuid() {
    final rng = Random.secure();
    final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');
    final parts = bytes.map(hex).toList();
    return '${parts.sublist(0, 4).join()}-'
        '${parts.sublist(4, 6).join()}-'
        '${parts.sublist(6, 8).join()}-'
        '${parts.sublist(8, 10).join()}-'
        '${parts.sublist(10, 16).join()}';
  }
}
