import 'dart:async';

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
import 'features/auth/presentation/auth_provider.dart';

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
    unawaited(_loadPersistedSettings());
    ref.listenManual<GoRouter>(routerProvider, (prev, next) {
      final path = next.routeInformationProvider.value.uri.path;
      final locale = ref.read(languageProvider);
      final l10n = lookupAppLocalizations(Locale(locale));
      final meta = metaForPath(path, l10n);
      _webMetaService.apply(meta, locale: locale);
    });
    ref.listenManual<AuthState>(authStateProvider, (prev, next) {
      if (next.isAuthenticated && prev?.user?.id != next.user?.id) {
        unawaited(_bootstrapRealtimeState());
      }
      // The shared AuthNotifier no longer receives the web E2EE sent-message
      // cache, so clear it here when the user logs out.
      if (prev?.isAuthenticated == true && !next.isAuthenticated) {
        unawaited(
          ref.read(e2eeSentMessageCacheProvider).clearAll().catchError(
            (Object e, StackTrace st) {
              AppLogger.instance.error(
                'Failed to clear E2EE sent message cache on logout',
                e,
                st,
                'e2ee',
              );
            },
          ),
        );
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      AppLogger.init(errorReporter: ref.read(errorReporterProvider));
      final analytics = ref.read(analyticsProvider);
      analytics.trackEvent('app_start', {'platform': 'web'});
      ref.read(authStateProvider.notifier).checkAuth();

      final locale = ref.read(languageProvider);
      final l10n = lookupAppLocalizations(Locale(locale));
      _webMetaService.apply(fallbackMetaForLocale(l10n), locale: locale);
    });
  }

  Future<void> _bootstrapRealtimeState() async {
    try {
      await Future.wait([
        ref.read(chatStateProvider.notifier).loadSessions(),
        ref.read(contactsStateProvider.notifier).loadFriends(),
      ]);
    } catch (e, st) {
      AppLogger.instance.error('Realtime bootstrap failed', e, st, 'ws');
    }
  }

  Future<void> _loadPersistedSettings() async {
    try {
      final storage = ref.read(storageProvider);
      final savedLanguage = await storage.getString('app_language');
      if (savedLanguage != null &&
          (savedLanguage == 'en' || savedLanguage == 'zh')) {
        ref.read(languageProvider.notifier).state = savedLanguage;
      }
      final savedTheme = await storage.getString('app_theme_mode');
      if (savedTheme != null) {
        final themeMode = switch (savedTheme) {
          'light' => ThemeMode.light,
          'dark' => ThemeMode.dark,
          'system' => ThemeMode.system,
          _ => ThemeMode.system,
        };
        ref.read(themeModeProvider.notifier).state = themeMode;
      }
    } catch (e) {
      AppLogger.instance.warn('Failed to load persisted settings: $e');
    }
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
