import 'package:idb_shim/idb_browser.dart' as idb;

const e2eeDbName = 'e2ee_keys';
const e2eeDbVersion = 3;
const e2eeStoreNames = [
  'identity',
  'prekeys',
  'sessions',
  'sender_keys',
  'meta'
];

Future<idb.Database> openE2eeDatabase() async {
  try {
    final db = await _open();
    if (_hasFinalSchema(db)) {
      return db;
    }
    db.close();
  } catch (_) {
    // Final E2EE storage has no legacy compatibility path. If the local
    // database cannot be opened, rebuild it from the canonical schema.
  }

  await idb.idbFactoryBrowser.deleteDatabase(e2eeDbName);
  return _open();
}

Future<idb.Database> _open() {
  return idb.idbFactoryBrowser.open(
    e2eeDbName,
    version: e2eeDbVersion,
    onUpgradeNeeded: (e) {
      final db = e.database;
      for (final storeName in e2eeStoreNames) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    },
  );
}

bool _hasFinalSchema(idb.Database db) {
  for (final storeName in e2eeStoreNames) {
    if (!db.objectStoreNames.contains(storeName)) {
      return false;
    }
  }
  return true;
}
