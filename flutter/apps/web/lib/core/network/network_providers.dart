import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// ---------------------------------------------------------------------------
// Network & Storage Providers
//
// Web-specific adapter imports have been removed from this file to keep it
// safe for VM tests.  The real web adapters are provided via ProviderScope
// overrides in main.dart.
// ---------------------------------------------------------------------------

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  throw UnimplementedError(
      'secureStorageProvider must be overridden at app startup');
});

final storageProvider = Provider<StoragePort>((ref) {
  throw UnimplementedError('storageProvider must be overridden at app startup');
});

final httpClientProvider = Provider<HttpClientPort>((ref) {
  throw UnimplementedError(
      'httpClientProvider must be overridden at app startup');
});

final wsClientProvider = Provider<WsClientPort>((ref) {
  throw UnimplementedError(
      'wsClientProvider must be overridden at app startup');
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});
