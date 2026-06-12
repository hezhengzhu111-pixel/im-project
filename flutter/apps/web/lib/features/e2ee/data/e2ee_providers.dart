import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_shared_features/e2ee.dart' as shared;
import 'e2ee_key_store.dart' as web_key_store;
import 'e2ee_sent_message_cache.dart';
import 'e2ee_sent_message_cache_impl.dart';
import 'e2ee_session_store.dart' as web_session_store;

export 'package:im_shared_features/e2ee.dart'
    show
        E2eeApi,
        E2eeKeyStore,
        E2eeManager,
        E2eeMetaStore,
        E2eeSessionStore,
        e2eeAdapterProvider,
        e2eeApiProvider,
        e2eeKeyStoreProvider,
        e2eeManagerProvider,
        e2eeMetaStoreProvider,
        e2eeSessionStatusProvider,
        e2eeSessionStoreProvider;

final webE2eeKeyStoreProvider = Provider<shared.E2eeKeyStore>((ref) {
  final store = web_key_store.E2eeKeyStore();
  ref.onDispose(() => store.dispose());
  return store;
});

final webE2eeSessionStoreProvider = Provider<shared.E2eeSessionStore>((ref) {
  final store = web_session_store.E2eeSessionStore();
  ref.onDispose(() => store.dispose());
  return store;
});

final e2eeSentMessageCacheProvider = Provider<E2eeSentMessageCache>((ref) {
  final storage = IdbSentMessageCacheStorage(dbName: 'im_e2ee_sent_cache');
  return E2eeSentMessageCache(storage: storage);
});
