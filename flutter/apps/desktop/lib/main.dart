import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'package:im_shared_features/chat.dart' as chat;
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/e2ee.dart';
import 'app.dart';
import 'adapters/desktop_network_adapter.dart';
import 'adapters/desktop_storage_adapter.dart';
import 'adapters/desktop_file_picker_adapter.dart';
import 'adapters/desktop_notification_adapter.dart';
import 'adapters/desktop_clipboard_adapter.dart';
import 'adapters/desktop_share_adapter.dart';
import 'adapters/desktop_audio_recorder_adapter.dart';
import 'adapters/desktop_ws_adapter.dart';
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'core/di/platform_providers.dart';
import 'core/logging/app_logger.dart';
import 'core/settings/settings_persistence.dart';
import 'core/startup/fatal_startup_app.dart';
import 'adapters/e2ee/desktop_key_store.dart';
import 'adapters/e2ee/desktop_session_store.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize settings persistence
  final settingsPersistence = SettingsPersistence();
  await settingsPersistence.init();

  // Get saved settings
  final savedLanguage = settingsPersistence.getLanguage();
  final savedThemeMode = settingsPersistence.getThemeMode();

  final rustGateway = FrbRustGateway();

  // Initialize logger first so Rust bridge failures are visible in logs.
  AppLogger.init(
    errorReporter: NoopErrorReporterAdapter(),
  );

  // Initialize Rust bridge. A failure here is fatal: the E2EE and low-level
  // networking code cannot function without it. Show a minimal error app
  // instead of silently continuing with a broken provider tree.
  try {
    await rustGateway.init();
  } catch (e, st) {
    AppLogger.instance.error('Rust bridge initialization failed', e, st, 'rust');
    runApp(const FatalStartupApp(
      title: '客户端启动失败',
      message:
          'Rust Bridge 初始化失败。请检查安装包是否完整，或重新安装本客户端。',
    ));
    return;
  }

  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );

  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:8082',
  );

  final storageService = await DesktopStorageService.create();
  final secureStorageService = DesktopSecureStorageAdapter();
  final networkService = DesktopNetworkService(baseUrl: apiBase);

  runApp(ProviderScope(
    overrides: [
      // 平台能力适配器
      filePickerPortProvider.overrideWithValue(DesktopFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(DesktopNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(DesktopClipboardAdapter()),
      sharePortProvider.overrideWithValue(DesktopShareAdapter()),
      audioRecorderPortProvider
          .overrideWithValue(DesktopAudioRecorderAdapter()),
      // 网络和存储适配器
      httpClientProvider.overrideWithValue(networkService),
      storageProvider.overrideWithValue(storageService),
      secureStorageProvider.overrideWithValue(secureStorageService),
      wsClientProvider.overrideWithValue(
        DesktopWsAdapter(
          ticketUrl: AuthEndpoints.wsTicket,
          wsBaseUrl: '$wsBase${WsEndpoints.path}',
          ticketProvider: () async {
            final response = await networkService.post<Map<String, dynamic>>(
              AuthEndpoints.wsTicket,
              fromJson: (json) => json,
            );
            return response.data['ticket'] as String?;
          },
        ),
      ),
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(rustGateway),
      e2eeKeyStoreProvider.overrideWithValue(DesktopKeyStore()),
      e2eeSessionStoreProvider.overrideWithValue(DesktopSessionStore()),
      // 聊天状态：显式注入 Desktop E2EE 依赖，确保 Desktop 端 E2EE 真正可用。
      chat.chatStateProvider.overrideWith((ref) {
        return chat.ChatNotifier(
          ref.watch(chat.messageApiProvider),
          chat.MessagePipeline(),
          ref.watch(wsClientProvider),
          () => ref.read(currentUserIdProvider),
          e2eeManager: ref.watch(e2eeManagerProvider),
          e2eeMetaStore: ref.watch(e2eeMetaStoreProvider),
          sentMessageCache: ref.watch(chat.sentMessageCacheProvider),
        );
      }),
      // 第三方服务适配器
      analyticsProvider.overrideWithValue(NoopAnalyticsAdapter()),
      errorReporterProvider.overrideWithValue(NoopErrorReporterAdapter()),
      pushProvider.overrideWithValue(NoopPushAdapter()),
      // 设置持久化（从本地存储恢复）
      languageProvider.overrideWith((ref) => savedLanguage),
      themeModeProvider.overrideWith((ref) => savedThemeMode),
    ],
    child: App(settingsPersistence: settingsPersistence),
  ));
}
