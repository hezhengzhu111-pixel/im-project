import 'package:idb_shim/idb_browser.dart' as idb;

/// Stores E2EE key material in IndexedDB.
/// Database: "e2ee_keys", version 1
/// Object stores: "identity", "meta"
class E2eeKeyStore {
  E2eeKeyStore();

  static const _dbName = 'e2ee_keys';
  static const _dbVersion = 1;
  static const _identityStore = 'identity';
  static const _metaStore = 'meta';

  idb.Database? _db;

  Future<void> init() async {
    _db = await idb.idbFactoryNative.open(
      _dbName,
      version: _dbVersion,
      onUpgradeNeeded: (e) {
        final db = e.database;
        if (!db.objectStoreNames.contains(_identityStore)) {
          db.createObjectStore(_identityStore);
        }
        if (!db.objectStoreNames.contains(_metaStore)) {
          db.createObjectStore(_metaStore);
        }
      },
    );
  }

  Future<void> saveKeyMaterial(String base64Bundle) async {
    final db = _db!;
    final txn = db.transaction(_identityStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_identityStore);
    await store.put(base64Bundle, 'rustLocalKeyMaterial');
    await txn.completed;
  }

  Future<String?> getKeyMaterial() async {
    final db = _db!;
    final txn = db.transaction(_identityStore, idb.idbModeReadOnly);
    final store = txn.objectStore(_identityStore);
    final result = await store.getObject('rustLocalKeyMaterial');
    await txn.completed;
    return result as String?;
  }

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

  Future<void> clearAll() async {
    final db = _db!;
    final txn = db.transactionList(
      [_identityStore, _metaStore],
      idb.idbModeReadWrite,
    );
    await txn.objectStore(_identityStore).clear();
    await txn.objectStore(_metaStore).clear();
    await txn.completed;
  }

  void dispose() {
    _db?.close();
  }
}
