import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Hardcoded Chinese strings', () {
    test('should not contain hardcoded Chinese in lib/ dart files', () {
      final libDir = Directory('lib');
      final chineseRegex = RegExp(r"[一-鿿]+");
      final commentRegex = RegExp(r'//.*|/\*[\s\S]*?\*/');
      final excludedFiles = [
        'app_en.arb',
        'app_zh.arb',
        'app_localizations', // generated l10n files
        'agreement_dialog', // out of scope - legal text
        'message_lock_icon', // out of scope
        'bind_email_dialog', // out of scope
        'bind_phone_dialog', // out of scope
        'settings_page', // contains language name '中文'
        'web_meta_defaults', // SEO defaults - out of scope
        'app_router', // fallback values for null l10n
        'web_file_picker_adapter', // adapter layer - out of scope
      ];

      final violations = <String>[];

      for (final entity in libDir.listSync(recursive: true)) {
        if (entity is! File) continue;
        if (!entity.path.endsWith('.dart')) continue;

        final relativePath =
            entity.path.replaceFirst('lib${Platform.pathSeparator}', '');
        if (excludedFiles.any((f) => relativePath.contains(f))) continue;

        final content = entity.readAsStringSync();
        // Remove comments
        final cleaned = content.replaceAll(commentRegex, '');
        // Remove strings in AppLocalizations calls (already i18n'd)
        final i18nCleaned =
            cleaned.replaceAll(RegExp(r'loc\.\w+\([^)]*\)'), '');

        final matches = chineseRegex.allMatches(i18nCleaned);
        if (matches.isNotEmpty) {
          violations.add(
              '${entity.path}: ${matches.map((m) => m.group(0)).join(", ")}');
        }
      }

      if (violations.isNotEmpty) {
        fail('Found hardcoded Chinese strings:\n${violations.join('\n')}');
      }
    });
  });
}
