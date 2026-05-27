import 'package:idb_shim/idb_browser.dart' as idb;

/// Stores E2EE ratchet session states in IndexedDB.
/// Database: "e2ee_sessions", version 1
/// Object store: "sessions" — keyed by sessionId, value is base64 v3 envelope
class E2eeSessionStore {
  E2eeSessionStore();

  static const _dbName = 'e2ee_sessions';
  static const _dbVersion = 1;
  static const _sessionsStore = 'sessions';

  idb.Database? _db;

  Future<void> init() async {
    _db = await idb.idbFactoryNative.open(
      _dbName,
      version: _dbVersion,
      onUpgradeNeeded: (e) {
        final db = e.database;
        if (!db.objectStoreNames.contains(_sessionsStore)) {
          db.createObjectStore(_sessionsStore);
        }
      },
    );
  }

  Future<void> saveSession(String sessionId, String envelopeBase64) async {
    final db = _db!;
    final txn = db.transaction(_sessionsStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_sessionsStore);
    await store.put(envelopeBase64, sessionId);
    await txn.completed;
  }

  Future<String?> getSession(String sessionId) async {
    final db = _db!;
    final txn = db.transaction(_sessionsStore, idb.idbModeReadOnly);
    final store = txn.objectStore(_sessionsStore);
    final result = await store.getObject(sessionId);
    await txn.completed;
    return result as String?;
  }

  Future<void> deleteSession(String sessionId) async {
    final db = _db!;
    final txn = db.transaction(_sessionsStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_sessionsStore);
    await store.delete(sessionId);
    await txn.completed;
  }

  Future<void> clearAll() async {
    final db = _db!;
    final txn = db.transaction(_sessionsStore, idb.idbModeReadWrite);
    final store = txn.objectStore(_sessionsStore);
    await store.clear();
    await txn.completed;
  }

  void dispose() {
    _db?.close();
  }
}
