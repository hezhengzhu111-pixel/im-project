import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/features/settings/presentation/settings_providers.dart';

/// A minimal widget that displays the current language from the provider.
class _LanguageDisplayWidget extends ConsumerWidget {
  const _LanguageDisplayWidget();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = ref.watch(languageProvider);
    return Text('current_language:$language');
  }
}

void main() {
  group('Language Switch', () {
    testWidgets('should default to zh when no saved language', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: const MaterialApp(
            home: Scaffold(body: _LanguageDisplayWidget()),
          ),
        ),
      );

      expect(find.text('current_language:zh'), findsOneWidget);
    });

    testWidgets('should reflect language change via provider', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            languageProvider.overrideWith((ref) => 'en'),
          ],
          child: const MaterialApp(
            home: Scaffold(body: _LanguageDisplayWidget()),
          ),
        ),
      );

      expect(find.text('current_language:en'), findsOneWidget);

      // Switch language by updating provider
      final container = ProviderScope.containerOf(
        tester.element(find.byType(_LanguageDisplayWidget)),
      );
      container.read(languageProvider.notifier).state = 'zh';
      await tester.pumpAndSettle();

      expect(find.text('current_language:zh'), findsOneWidget);
    });

    testWidgets('should support switching between all locales', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: const MaterialApp(
            home: Scaffold(body: _LanguageDisplayWidget()),
          ),
        ),
      );

      final container = ProviderScope.containerOf(
        tester.element(find.byType(_LanguageDisplayWidget)),
      );

      // Switch to English
      container.read(languageProvider.notifier).state = 'en';
      await tester.pumpAndSettle();
      expect(find.text('current_language:en'), findsOneWidget);

      // Switch back to Chinese
      container.read(languageProvider.notifier).state = 'zh';
      await tester.pumpAndSettle();
      expect(find.text('current_language:zh'), findsOneWidget);
    });
  });
}
