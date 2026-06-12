import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/features/settings/presentation/settings_providers.dart';

/// A minimal widget that displays the current theme mode from the provider.
class _ThemeDisplayWidget extends ConsumerWidget {
  const _ThemeDisplayWidget();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return Text('current_theme:${themeMode.name}');
  }
}

void main() {
  group('Theme Switch', () {
    testWidgets('should default to system theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: const MaterialApp(
            home: Scaffold(body: _ThemeDisplayWidget()),
          ),
        ),
      );

      expect(find.text('current_theme:system'), findsOneWidget);
    });

    testWidgets('should reflect theme change via provider', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            themeModeProvider.overrideWith((ref) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: Scaffold(body: _ThemeDisplayWidget()),
          ),
        ),
      );

      expect(find.text('current_theme:dark'), findsOneWidget);

      // Switch theme by updating provider
      final container = ProviderScope.containerOf(
        tester.element(find.byType(_ThemeDisplayWidget)),
      );
      container.read(themeModeProvider.notifier).state = ThemeMode.light;
      await tester.pumpAndSettle();

      expect(find.text('current_theme:light'), findsOneWidget);
    });

    testWidgets('should support switching between all theme modes',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: const MaterialApp(
            home: Scaffold(body: _ThemeDisplayWidget()),
          ),
        ),
      );

      final container = ProviderScope.containerOf(
        tester.element(find.byType(_ThemeDisplayWidget)),
      );

      // Switch to light
      container.read(themeModeProvider.notifier).state = ThemeMode.light;
      await tester.pumpAndSettle();
      expect(find.text('current_theme:light'), findsOneWidget);

      // Switch to dark
      container.read(themeModeProvider.notifier).state = ThemeMode.dark;
      await tester.pumpAndSettle();
      expect(find.text('current_theme:dark'), findsOneWidget);

      // Switch to system
      container.read(themeModeProvider.notifier).state = ThemeMode.system;
      await tester.pumpAndSettle();
      expect(find.text('current_theme:system'), findsOneWidget);
    });
  });
}
