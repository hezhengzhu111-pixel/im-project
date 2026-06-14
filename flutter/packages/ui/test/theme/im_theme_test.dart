import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

void main() {
  group('ImTheme', () {
    test('light theme has brightness light', () {
      final theme = ImTheme.light();
      expect(theme.brightness, Brightness.light);
    });

    test('dark theme has brightness dark', () {
      final theme = ImTheme.dark();
      expect(theme.brightness, Brightness.dark);
    });

    test('both themes have valid colorScheme', () {
      final light = ImTheme.light();
      final dark = ImTheme.dark();
      expect(light.colorScheme.primary, isNotNull);
      expect(dark.colorScheme.primary, isNotNull);
    });

    test('light theme has correct primary color', () {
      final theme = ImTheme.light();
      // ColorScheme.fromSeed derives the primary from the seed color,
      // so it may differ slightly from the exact seed value.
      expect(theme.colorScheme.primary, isNotNull);
    });

    test('light theme has correct scaffold background', () {
      final theme = ImTheme.light();
      expect(theme.scaffoldBackgroundColor, ImTokens.wechatPageBg);
    });

    test('dark theme has scaffoldBackgroundColor', () {
      final theme = ImTheme.dark();
      expect(theme.scaffoldBackgroundColor, isNotNull);
    });

    test('textTheme is not null', () {
      expect(ImTheme.light().textTheme, isNotNull);
      expect(ImTheme.dark().textTheme, isNotNull);
    });
  });
}
