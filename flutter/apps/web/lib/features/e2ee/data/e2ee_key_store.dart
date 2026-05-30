import 'dart:convert';

import 'package:idb_shim/idb_browser.dart' as idb;

/// Stores E2EE key material in IndexedDB.
/// Database: "e2ee_keys", version 3
/// Object stores: "identity", "meta"
class E2eeKeyStore {
  E2eeKeyStore();

  static const _dbName = 'e2ee_keys';
  static const _dbVersion = 3;
  static const _identityStore = 'identity';
  static const _metaStore = 'meta';
  static const _localKeyMaterialKey = 'rustLocalKeyMaterial';

  idb.Database? _db;

  Future<void> init() async {
    _db = await idb.idbFactoryNative.open(
      _dbName,
      version: _dbVersion,
      onUpgradeNeeded: (e) {
        final db = e.database;
        final stores = ['identity', 'prekeys', 'sessions', 'sender_keys', 'meta'];
        for (final storeName in stores) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        }
      },
    );
  }

  // -- Identity store --

  Future<void> saveKeyMaterial(String base64Bundle) async {
    final db = _db!;
    final txn = db.transaction(_identityStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_identityStore);
    await store.put(base64Bundle, _localKeyMaterialKey);
    await txn.completed;
  }

  Future<String?> getKeyMaterial() async {
    final db = _db!;
    final txn = db.transaction(_identityStore, idb.idbModeReadOnly);
    final store = txn.objectStore(_identityStore);
    final result = await store.getObject(_localKeyMaterialKey);
    await txn.completed;
    return result as String?;
  }

  /// Mark a one-time pre-key as consumed.
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
          .where((otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId)
          .toList();
    }

    await saveKeyMaterial(jsonEncode(keyMaterial));
  }

  // -- Meta store --

  Future<void> saveDeviceId(String deviceId) async {
    final db = _db!;
    final txn = db.transaction(_metaStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_metaStore);
    await store.put(deviceId, 'deviceId');
    await txn.completed;
  }

  Future<String?> getDeviceId() async {
    final db = _db!;
    final txn = db.transaction(_metaStore, idb.idbModeReadOnly);
    final store = txn.objectStore(_metaStore);
    final result = await store.getObject('deviceId');
    await txn.completed;
    return result as String?;
  }

  Future<void> savePublicBundle(String bundleJson) async {
    final db = _db!;
    final txn = db.transaction(_metaStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_metaStore);
    await store.put(bundleJson, 'localPublicBundle');
    await txn.completed;
  }

  Future<String?> getPublicBundle() async {
    final db = _db!;
    final txn = db.transaction(_metaStore, idb.idbModeReadOnly);
    final store = txn.objectStore(_metaStore);
    final result = await store.getObject('localPublicBundle');
    await txn.completed;
    return result as String?;
  }

  // -- Clear (matching Vue clearLocalKeyMaterial) --

  Future<void> clearKeyMaterial() async {
    final db = _db!;
    final txn = db.transactionList(
      [_identityStore, _metaStore],
      idb.idbModeReadWrite,
    );
    await txn.objectStore(_identityStore).delete(_localKeyMaterialKey);
    await txn.objectStore(_metaStore).delete('localPublicBundle');
    await txn.completed;
  }

  Future<void> clearAll() async {
    final db = _db!;
    final storeNames = ['identity', 'prekeys', 'sessions', 'sender_keys', 'meta'];
    final txn = db.transactionList(storeNames, idb.idbModeReadWrite);
    for (final storeName in storeNames) {
      await txn.objectStore(storeName).clear();
    }
    await txn.completed;
  }

  void dispose() {
    _db?.close();
  }
}
