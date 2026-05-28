import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/router/route_observer.dart';
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
      ref.read(authStateProvider.notifier).checkAuth();
      _webMetaService.apply(appFallbackMeta);

      ref.listen<GoRouter>(routerProvider, (prev, next) {
        final path = next.routeInformationProvider.value.uri.path;
        final meta = metaForPath(path);
        _webMetaService.apply(meta);
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
        if (child == null) return const SizedBox.shrink();
        return Navigator(
          observers: [routeObserver],
          onGenerateRoute: (_) => null,
          pages: [MaterialPage(child: child)],
        );
      },
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
