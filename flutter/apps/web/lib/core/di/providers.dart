/// Barrel export — 所有 provider 通过此文件统一导入。
/// 各 feature 自己持有 provider 定义，这里只做 re-export。

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

import '../../adapters/services/noop_analytics_adapter.dart';
import '../../adapters/services/noop_error_reporter_adapter.dart';
import '../../adapters/services/noop_push_adapter.dart';
import '../../adapters/services/noop_payment_adapter.dart';
import '../../adapters/services/noop_map_adapter.dart';
import '../../adapters/services/noop_file_preview_adapter.dart';

// Core
export 'platform_providers.dart';
export '../config/app_config_provider.dart';
export '../network/network_providers.dart';
export '../network/network_status_provider.dart';
export '../observer/app_provider_observer.dart';
export '../error/error_notifier.dart';

// Features
export '../../features/auth/presentation/auth_providers.dart';
export '../../features/chat/presentation/chat_providers.dart';
export '../../features/chat/data/file_providers.dart';
export '../../features/contacts/presentation/contacts_providers.dart';
export '../../features/moments/presentation/moments_providers.dart';
export '../../features/settings/presentation/settings_providers.dart';
export '../../features/group/presentation/group_providers.dart';
export '../../features/e2ee/data/e2ee_providers.dart';

// Third-party Services
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

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
