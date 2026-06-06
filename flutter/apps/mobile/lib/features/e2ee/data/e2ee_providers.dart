import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/platform_providers.dart';
import 'package:im_mobile/features/auth/auth.dart';
import 'e2ee_api.dart';
import 'e2ee_key_store.dart';
import 'e2ee_manager.dart';
import 'e2ee_meta_store.dart';
import 'e2ee_session_store.dart';

final e2eeApiProvider = Provider<E2eeApi>((ref) {
  return E2eeApi(ref.watch(httpClientProvider));
});

final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  throw UnimplementedError('e2eeKeyStoreProvider must be overridden');
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  throw UnimplementedError('e2eeSessionStoreProvider must be overridden');
});

final e2eeMetaStoreProvider = Provider<E2eeMetaStore>((ref) {
  return E2eeMetaStore(ref.watch(secureStorageProvider));
});

final e2eeManagerProvider = Provider<E2eeManager>((ref) {
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: ref.watch(currentUserIdProvider),
  );
});

final e2eeSessionStatusProvider =
    FutureProvider.family<String, String>((ref, sessionId) async {
  return ref.watch(e2eeMetaStoreProvider).getSessionStatus(sessionId);
});
