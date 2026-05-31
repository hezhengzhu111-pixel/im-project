import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_ui/im_ui.dart';

import 'core/di/platform_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

/// Root application widget for the mobile IM app.
///
/// Uses [ConsumerWidget] to watch Riverpod providers for routing, locale,
/// and theme configuration.
class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'IM Mobile',
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
    );
  }
}
