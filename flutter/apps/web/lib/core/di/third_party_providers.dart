/// Third-party service providers.
/// Separated from main providers.dart to avoid circular imports.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

import '../../adapters/services/noop_analytics_adapter.dart';
import '../../adapters/services/noop_error_reporter_adapter.dart';
import '../../adapters/services/noop_push_adapter.dart';
import '../../adapters/services/noop_payment_adapter.dart';
import '../../adapters/services/noop_map_adapter.dart';
import '../../adapters/services/noop_file_preview_adapter.dart';
import '../config/app_config_provider.dart';

final analyticsProvider = Provider<AnalyticsPort>((ref) {
  return ref.watch(appConfigProvider).analyticsEnabled
      ? NoopAnalyticsAdapter() // Replace with real adapter when ready
      : NoopAnalyticsAdapter();
});

final errorReporterProvider = Provider<ErrorReporterPort>((ref) {
  return ref.watch(appConfigProvider).errorReporterEnabled
      ? NoopErrorReporterAdapter() // Replace with real adapter when ready
      : NoopErrorReporterAdapter();
});

final pushProvider = Provider<PushPort>((ref) {
  return ref.watch(appConfigProvider).pushEnabled
      ? NoopPushAdapter() // Replace with real adapter when ready
      : NoopPushAdapter();
});

final paymentProvider = Provider<PaymentPort>((ref) {
  return ref.watch(appConfigProvider).paymentEnabled
      ? NoopPaymentAdapter() // Replace with real adapter when ready
      : NoopPaymentAdapter();
});

final mapProvider = Provider<MapPort>((ref) {
  return ref.watch(appConfigProvider).mapEnabled
      ? NoopMapAdapter() // Replace with real adapter when ready
      : NoopMapAdapter();
});

final filePreviewProvider = Provider<FilePreviewPort>((ref) {
  return ref.watch(appConfigProvider).filePreviewEnabled
      ? NoopFilePreviewAdapter() // Replace with real adapter when ready
      : NoopFilePreviewAdapter();
});
