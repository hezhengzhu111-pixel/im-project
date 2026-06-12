import 'package:idb_shim/idb_browser.dart';
import 'e2ee_sent_message_cache.dart';

/// IndexedDB implementation of [SentMessageCacheStorage].
class IdbSentMessageCacheStorage implements SentMessageCacheStorage {
  IdbSentMessageCacheStorage(
      {required this.dbName, this.storeName = 'e2ee_sent_cache'});

  final String dbName;
  final String storeName;

  Database? _db;

  Future<Database> _getDatabase() async {
    if (_db != null) return _db!;

    final factory = getIdbFactory()!;
    _db = await factory.open(
      dbName,
      version: 1,
      onUpgradeNeeded: (event) {
        final db = event.database;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      },
    );
    return _db!;
  }

  @override
  Future<void> write(String key, Map<String, dynamic> value) async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadWrite);
    final store = txn.objectStore(storeName);
    await store.put(value, key);
    await txn.completed;
  }

  @override
  Future<Map<String, dynamic>?> read(String key) async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadOnly);
    final store = txn.objectStore(storeName);
    final result = await store.getObject(key);
    await txn.completed;

    if (result == null) return null;
    if (result is Map) {
      return Map<String, dynamic>.from(result);
    }
    return null;
  }

  @override
  Future<void> delete(String key) async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadWrite);
    final store = txn.objectStore(storeName);
    await store.delete(key);
    await txn.completed;
  }

  @override
  Future<void> clearAll() async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadWrite);
    final store = txn.objectStore(storeName);
    await store.clear();
    await txn.completed;
  }

  @override
  Future<void> deleteBySession(String e2eeSessionId) async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadWrite);
    final store = txn.objectStore(storeName);

    // Iterate through all entries and delete those matching the session.
    final cursor = await store.openCursor(autoAdvance: true);
    await for (final cursorEvent in cursor) {
      final value = cursorEvent.value;
      if (value is Map && value['e2eeSessionId'] == e2eeSessionId) {
        await cursorEvent.delete();
      }
    }

    await txn.completed;
  }

  @override
  Future<List<String>> getAllKeys() async {
    final db = await _getDatabase();
    final txn = db.transaction(storeName, idbModeReadOnly);
    final store = txn.objectStore(storeName);
    final keys = await store.getAllKeys();
    await txn.completed;

    return keys.map((k) => k.toString()).toList();
  }
}
