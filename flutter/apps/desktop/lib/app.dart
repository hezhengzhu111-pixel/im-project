import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/di/platform_providers.dart';
import 'core/settings/settings_persistence.dart';

class App extends ConsumerStatefulWidget {
  final SettingsPersistence settingsPersistence;

  const App({super.key, required this.settingsPersistence});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  @override
  void initState() {
    super.initState();
    // Listen for language changes and persist
    ref.listen<String>(languageProvider, (previous, next) {
      widget.settingsPersistence.setLanguage(next);
    });

    // Listen for theme changes and persist
    ref.listen<ThemeMode>(themeModeProvider, (previous, next) {
      widget.settingsPersistence.setThemeMode(next);
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'IM Desktop',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      locale: Locale(locale),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) {
        return BreakpointScope(
          child: child ?? const SizedBox.shrink(),
        );
      },
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
