import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../config/app_config_provider.dart';

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  return WebSecureStorageAdapter();
});

final storageProvider = Provider<StoragePort>((ref) {
  return WebStorageAdapter();
});

final httpClientProvider = Provider<HttpClientPort>((ref) {
  final config = ref.watch(appConfigProvider);
  return WebHttpClient(
    baseUrl: config.apiBaseUrl,
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final wsClientProvider = Provider<WsClientPort>((ref) {
  final config = ref.watch(appConfigProvider);
  final client = WebWsClient(
    ticketUrl: AuthEndpoints.wsTicket,
    wsBaseUrl: '${config.wsBaseUrl}${WsEndpoints.path}',
  );
  ref.onDispose(() => client.dispose());
  return client;
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});
