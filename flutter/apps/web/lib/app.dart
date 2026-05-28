import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'core/di/providers.dart';
import 'core/logging/app_logger.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/web_meta/web_meta_defaults.dart';
import 'core/web_meta/web_meta_service.dart';

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  final _webMetaService = createWebMetaService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppLogger.init(errorReporter: ref.read(errorReporterProvider));
      final analytics = ref.read(analyticsProvider);
      analytics.trackEvent('app_start', {'platform': 'web'});
      ref.read(authStateProvider.notifier).checkAuth();

      final locale = ref.read(languageProvider);
      final l10n = lookupAppLocalizations(Locale(locale));
      _webMetaService.apply(fallbackMetaForLocale(l10n), locale: locale);

      ref.listen<GoRouter>(routerProvider, (prev, next) {
        final path = next.routeInformationProvider.value.uri.path;
        final locale = ref.read(languageProvider);
        final l10n = lookupAppLocalizations(Locale(locale));
        final meta = metaForPath(path, l10n);
        _webMetaService.apply(meta, locale: locale);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'IM',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      locale: Locale(locale),
      routerConfig: router,
      builder: (context, child) {
        return BreakpointScope(
          child: child ?? const SizedBox.shrink(),
        );
      },
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
