/// Barrel export — 所有 provider 通过此文件统一导入。
/// 各 feature 自己持有 provider 定义，这里只做 re-export。

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
