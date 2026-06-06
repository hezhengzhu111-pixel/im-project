import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  throw UnimplementedError(
    'secureStorageProvider must be overridden at app startup',
  );
});

final storageProvider = Provider<StoragePort>((ref) {
  throw UnimplementedError(
    'storageProvider must be overridden at app startup',
  );
});

final httpClientProvider = Provider<HttpClientPort>((ref) {
  throw UnimplementedError(
    'httpClientProvider must be overridden at app startup',
  );
});

final wsClientProvider = Provider<WsClientPort>((ref) {
  throw UnimplementedError(
    'wsClientProvider must be overridden at app startup',
  );
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});

final e2eeAdapterProvider = Provider<E2eeBridge>((ref) {
  throw UnimplementedError(
    'e2eeAdapterProvider must be overridden at app startup',
  );
});

final analyticsProvider = Provider<AnalyticsPort>((ref) {
  throw UnimplementedError(
    'analyticsProvider must be overridden at app startup',
  );
});

final errorReporterProvider = Provider<ErrorReporterPort>((ref) {
  throw UnimplementedError(
    'errorReporterProvider must be overridden at app startup',
  );
});

final pushProvider = Provider<PushPort>((ref) {
  throw UnimplementedError(
    'pushProvider must be overridden at app startup',
  );
});
