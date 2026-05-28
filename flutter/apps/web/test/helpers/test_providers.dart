import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../lib/core/di/providers.dart';
import 'fakes.dart';

/// Creates a ProviderContainer with all port providers overridden by fakes.
///
/// Note: e2eeManagerProvider is NOT overridden here because its provider
/// definition imports web-specific adapters (dart:html). Tests that need
/// it should override it directly:
/// ```dart
/// import '../../lib/features/e2ee/data/e2ee_providers.dart';
/// container.override(e2eeManagerProvider, FakeE2eeManager());
/// ```
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
