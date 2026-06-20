import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart' as core_flutter;
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'app.dart';
import 'adapters/web_file_picker_adapter.dart';
import 'adapters/web_notification_adapter.dart';
import 'adapters/web_clipboard_adapter.dart';
import 'adapters/web_share_adapter.dart';
import 'adapters/web_audio_recorder_adapter.dart';
import 'adapters/web_storage_adapter.dart';
import 'adapters/web_http_adapter.dart';
import 'adapters/web_ws_adapter.dart';
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'core/di/platform_providers.dart';
import 'core/di/rust_bridge_init_provider.dart';
import 'core/di/rust_bridge_warmup.dart';
import 'core/network/network_providers.dart';
import 'core/network/network_status_initializer.dart';
import 'core/observer/app_provider_observer.dart';
import 'features/chat/presentation/chat_providers.dart' as web_chat;
import 'features/e2ee/data/e2ee_providers.dart';
import 'package:im_shared_features/chat.dart' as shared_chat;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  final rustGateway = FrbRustGateway();
  initNetworkStatus();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');

  // Build config from compile-time environment variables (same defaults as
  // appConfigProvider) so we can construct web adapters before the
  // ProviderScope is created.
  // 使用相对路径，通过 nginx 代理访问 API。
  // nginx 已将 /api/ 代理到后端，端点本身已以 /api 开头，
  // 因此 baseUrl 留空，最终请求的完整路径为 /api/...。
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: '', // 将在运行时动态构建
  );
  final wsEndpoint =
      wsBase.isEmpty ? WsEndpoints.path : '$wsBase${WsEndpoints.path}';
  final secureStorage = WebSecureStorageAdapter();
  final httpClient = WebHttpClient(baseUrl: apiBase);
  final filePicker = WebFilePickerAdapter();
  final notification = WebNotificationAdapter();
  final clipboard = WebClipboardAdapter();
  final share = WebShareAdapter();
  final audioRecorder = WebAudioRecorderAdapter();
  final storage = WebStorageAdapter();
  final analytics = NoopAnalyticsAdapter();
  final errorReporter = NoopErrorReporterAdapter();
  final push = NoopPushAdapter();

  final rustBridgeInit =
      StateController<AsyncValue<void>>(const AsyncValue.loading());

  runApp(ProviderScope(
    overrides: [
      // Platform capability adapters
      filePickerPortProvider.overrideWithValue(filePicker),
      notificationPortProvider.overrideWithValue(notification),
      clipboardPortProvider.overrideWithValue(clipboard),
      sharePortProvider.overrideWithValue(share),
      audioRecorderPortProvider.overrideWithValue(audioRecorder),
      // Network & storage adapters
      secureStorageProvider.overrideWithValue(secureStorage),
      storageProvider.overrideWithValue(storage),
      httpClientProvider.overrideWithValue(httpClient),
      // The WS client is created inside the provider tree so its lifecycle is
      // tied to ProviderScope disposal. Reading [httpClientProvider] here
      // returns the overridden [WebHttpClient] instance.
      wsClientProvider.overrideWith((ref) {
        final client = WebWsClient(
          ticketUrl: AuthEndpoints.wsTicket,
          wsBaseUrl: wsEndpoint,
          ticketProvider: () async {
            final response = await ref.read(httpClientProvider).post<
                Map<String, dynamic>>(
              AuthEndpoints.wsTicket,
              fromJson: (json) => json,
            );
            return response.data['ticket'] as String?;
          },
        );
        ref.onDispose(client.dispose);
        return client;
      }),
      rustBridgeInitProvider.overrideWith((ref) {
        ref.onDispose(rustBridgeInit.dispose);
        return rustBridgeInit;
      }),
      // E2EE adapter
      e2eeAdapterProvider.overrideWithValue(rustGateway),
      e2eeKeyStoreProvider.overrideWith((ref) {
        return ref.watch(webE2eeKeyStoreProvider);
      }),
      e2eeSessionStoreProvider.overrideWith((ref) {
        return ref.watch(webE2eeSessionStoreProvider);
      }),
      // Shared feature packages read the im_core_flutter provider set.
      core_flutter.filePickerPortProvider.overrideWithValue(filePicker),
      core_flutter.notificationPortProvider.overrideWithValue(notification),
      core_flutter.clipboardPortProvider.overrideWithValue(clipboard),
      core_flutter.sharePortProvider.overrideWithValue(share),
      core_flutter.audioRecorderPortProvider.overrideWithValue(audioRecorder),
      core_flutter.secureStorageProvider.overrideWithValue(secureStorage),
      core_flutter.storageProvider.overrideWithValue(storage),
      core_flutter.httpClientProvider.overrideWithValue(httpClient),
      core_flutter.wsClientProvider.overrideWith(
        (ref) => ref.read(wsClientProvider),
      ),
      core_flutter.e2eeAdapterProvider.overrideWithValue(rustGateway),
      core_flutter.analyticsProvider.overrideWithValue(analytics),
      core_flutter.errorReporterProvider.overrideWithValue(errorReporter),
      core_flutter.pushProvider.overrideWithValue(push),
      // The shared [ChatPage] reads from `im_shared_features` providers. The
      // web app builds its own [ChatNotifier] (with web-specific E2EE/outbox
      // dependencies), so bridge the two to avoid duplicate chat state and to
      // make shared widgets observe the same sessions as the web bootstrap.
      shared_chat.chatStateProvider.overrideWith(
        (ref) => ref.read(web_chat.chatStateProvider.notifier),
      ),
    ],
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));

  warmUpRustBridge(rustGateway.init, rustBridgeInit);
}
