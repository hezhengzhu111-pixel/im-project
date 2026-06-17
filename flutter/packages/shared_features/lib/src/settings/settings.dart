/// Settings data and provider layer shared between desktop and mobile.
///
/// NOTE: [SettingsPage] is NOT exported here; it stays in each app
/// due to i18n differences.
library;

export 'data/settings_api.dart';
export 'data/ai_api.dart';
export 'presentation/settings_provider.dart';
export 'presentation/settings_providers.dart';
export 'presentation/profile_provider.dart';
export 'presentation/ai_settings_provider.dart';
export 'presentation/profile_settings_page.dart';
export 'presentation/ai_settings_page.dart';
