import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../lib/core/di/providers.dart';
import 'fakes.dart';

/// Creates a ProviderContainer with all port providers overridden by fakes.
ProviderContainer createTestContainer({
  List<Override> overrides = const [],
}) {
  return ProviderContainer(overrides: [
    httpClientProvider.overrideWithValue(FakeHttpClientPort()),
    wsClientProvider.overrideWithValue(FakeWsClientPort()),
    secureStorageProvider.overrideWithValue(FakeSecureStoragePort()),
    storageProvider.overrideWithValue(FakeStoragePort()),
    ...overrides,
  ]);
}
