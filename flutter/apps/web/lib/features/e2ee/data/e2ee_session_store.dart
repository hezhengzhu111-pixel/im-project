import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:idb_shim/idb_browser.dart' as idb;
import 'package:im_shared_features/e2ee.dart' as shared;
import 'package:im_web/features/e2ee/data/e2ee_indexed_db.dart';

typedef SessionLookupResult = shared.SessionLookupResult;

/// Stores E2EE ratchet session states in IndexedDB.
/// Database: "e2ee_keys", version 3
/// Object store: "sessions" — keyed by sessionId, value is v3 envelope object
///
/// Matches Vue implementation with v3 envelope structure and context validation.
class E2eeSessionStore implements shared.E2eeSessionStore {
  E2eeSessionStore();

  static const _storeName = 'sessions';
  static const _sessionStateEnvelopeVersion = 3;
  static const _sessionStateAlgorithm = 'rust-x25519-x3dh-dr-v1';

  idb.Database? _db;

  Future<void> init() async {
    _db = await openE2eeDatabase();
  }

  // ---------------------------------------------------------------------------
  // Save session (v3 envelope)
  // ---------------------------------------------------------------------------

  Future<void> saveSession({
    required String sessionId,
    required String stateBase64,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    String direction = 'outbound',
  }) async {
    if (sessionId.isEmpty) throw Exception('E2EE session requires sessionId');
    if (localDeviceId.isEmpty)
      throw Exception('E2EE session requires localDeviceId');
    if (remoteDeviceId.isEmpty)
      throw Exception('E2EE session requires remoteDeviceId');

    final resolvedRemoteUserId =
        remoteUserId.isNotEmpty ? remoteUserId : remoteDeviceId;
    if (resolvedRemoteUserId.isEmpty)
      throw Exception('E2EE session requires remoteUserId');

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

    final db = _db!;
    final txn = db.transaction(_storeName, idb.idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.put(
      envelope,
      _sessionStorageKey(sessionId, localDeviceId, remoteDeviceId),
    );
    await txn.completed;
  }

  // ---------------------------------------------------------------------------
  // Get session (with v3 envelope validation)
  // ---------------------------------------------------------------------------

  Future<String?> getSession({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async {
    final db = _db!;
    final txn = db.transaction(_storeName, idb.idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    final result = await store.getObject(
          _sessionStorageKey(sessionId, localDeviceId, remoteDeviceId),
        ) ??
        await store.getObject(sessionId);
    await txn.completed;

    if (result == null) return null;

    try {
      final stored = result as Map<String, dynamic>;

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

  Future<shared.SessionLookupResult?> findSessionByLocalDevice({
    required String sessionId,
    required String localDeviceId,
  }) async {
    final db = _db!;
    final txn = db.transaction(_storeName, idb.idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    Object? result;
    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final value = cursor.value;
      if (value is! Map) return;
      if (value['sessionId'] != sessionId) return;
      if (value['localDeviceId'] != localDeviceId) return;
      result ??= value;
    });
    await txn.completed;

    if (result == null) return null;

    try {
      final stored = result as Map<String, dynamic>;
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

      return shared.SessionLookupResult(
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

  Future<void> deleteSession(String sessionId) async {
    final db = _db!;
    final txn = db.transaction(_storeName, idb.idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.delete(sessionId);
    final keysToDelete = <Object>[];
    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final value = cursor.value;
      if (value is! Map || value['sessionId'] != sessionId) return;
      keysToDelete.add(cursor.key);
    });
    for (final key in keysToDelete) {
      await store.delete(key);
    }
    await txn.completed;
  }

  Future<void> clearAll() async {
    final db = _db!;
    final txn = db.transaction(_storeName, idb.idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.clear();
    await txn.completed;
  }

  void dispose() {
    _db?.close();
  }

  static String _fingerprint(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString().substring(0, 16);
  }

  static String _sessionStorageKey(
    String sessionId,
    String localDeviceId,
    String remoteDeviceId,
  ) {
    return '$sessionId::$localDeviceId::$remoteDeviceId';
  }
}
