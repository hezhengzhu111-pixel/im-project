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
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();

    // 1. Synchronous logger init (early startup errors now captured)
    AppLogger.init(errorReporter: ref.read(errorReporterProvider));

    // 2. Get router instance and register route listener
    _router = ref.read(routerProvider);
    _router.routeInformationProvider.addListener(_onRouteChanged);

    // 3. Register locale change listener (ref.listenManual is valid in initState)
    ref.listenManual(languageProvider, _onLocaleChanged);

    // 4. One-time startup operations
    ref.read(authStateProvider.notifier).checkAuth();
    final analytics = ref.read(analyticsProvider);
    analytics.trackEvent('app_start', {'platform': 'web'});

    // 5. Apply initial fallback meta (listener will override once route resolves)
    _webMetaService.apply(appFallbackMeta);
  }

  void _onRouteChanged() {
    final path = _router.routeInformationProvider.value.uri.path;
    final locale = ref.read(languageProvider);
    final l10n = lookupAppLocalizations(Locale(locale));
    final meta = metaForPath(path, l10n);
    _webMetaService.apply(meta);
  }

  void _onLocaleChanged(String? previous, String next) {
    if (previous != next) {
      final path = _router.routeInformationProvider.value.uri.path;
      final l10n = lookupAppLocalizations(Locale(next));
      final meta = metaForPath(path, l10n);
      _webMetaService.apply(meta);
    }
  }

  @override
  void dispose() {
    _router.routeInformationProvider.removeListener(_onRouteChanged);
    super.dispose();
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
