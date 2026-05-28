import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/app.dart';

void main() {
  group('Theme Switch', () {
    testWidgets('should switch from light to dark theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            themeModeProvider.overrideWithValue(ThemeMode.light),
          ],
          child: const App(),
        ),
      );

      // Verify light theme is applied
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.themeMode, ThemeMode.light);

      // Switch to dark theme
      final container = ProviderScope.containerOf(find.byType(App));
      container.read(themeModeProvider.notifier).state = ThemeMode.dark;
      await tester.pumpAndSettle();

      // Verify dark theme is applied
      final updatedMaterialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(updatedMaterialApp.themeMode, ThemeMode.dark);
    });

    testWidgets('should switch from dark to system theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            themeModeProvider.overrideWithValue(ThemeMode.dark),
          ],
          child: const App(),
        ),
      );

      // Verify dark theme is applied
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.themeMode, ThemeMode.dark);

      // Switch to system theme
      final container = ProviderScope.containerOf(find.byType(App));
      container.read(themeModeProvider.notifier).state = ThemeMode.system;
      await tester.pumpAndSettle();

      // Verify system theme is applied
      final updatedMaterialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(updatedMaterialApp.themeMode, ThemeMode.system);
    });
  });
}
