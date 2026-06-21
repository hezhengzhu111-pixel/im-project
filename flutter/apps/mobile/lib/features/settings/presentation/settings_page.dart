import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../l10n/app_localizations.dart';
import 'package:im_shared_features/settings.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final language = ref.watch(languageProvider);
    final loc = AppLocalizations.of(context)!;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          loc.settingsTitle,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),

        // Theme
        Card(
          child: ListTile(
            leading: const Icon(Icons.brightness_6),
            title: Text(loc.settingsTheme),
            trailing: DropdownButton<ThemeMode>(
              value: themeMode,
              items: [
                DropdownMenuItem(
                    value: ThemeMode.system,
                    child: Text(loc.settingsThemeAuto)),
                DropdownMenuItem(
                    value: ThemeMode.light,
                    child: Text(loc.settingsThemeLight)),
                DropdownMenuItem(
                    value: ThemeMode.dark, child: Text(loc.settingsThemeDark)),
              ],
              onChanged: (value) {
                if (value != null) {
                  ref.read(themeModeProvider.notifier).state = value;
                }
              },
            ),
          ),
        ),

        // Language
        Card(
          child: ListTile(
            leading: const Icon(Icons.language),
            title: Text(loc.settingsLanguage),
            trailing: DropdownButton<String>(
              value: language,
              items: const [
                DropdownMenuItem(value: 'zh', child: Text('中文')),
                DropdownMenuItem(value: 'en', child: Text('English')),
              ],
              onChanged: (value) {
                if (value != null) {
                  ref.read(languageProvider.notifier).state = value;
                }
              },
            ),
          ),
        ),

        // Profile
        Card(
          child: ListTile(
            leading: const Icon(Icons.person),
            title: Text(loc.settingsProfile),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/profile'),
          ),
        ),

        // AI Settings
        Card(
          child: ListTile(
            leading: const Icon(Icons.smart_toy),
            title: Text(loc.settingsAi),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/ai'),
          ),
        ),

        // Clear Cache
        Card(
          child: ListTile(
            leading: const Icon(Icons.cleaning_services),
            title: Text(loc.settingsClearCache),
            subtitle: Text(loc.settingsClearCacheDesc),
            onTap: () => _confirmClearCache(context, ref, loc),
          ),
        ),

        // About
        Card(
          child: ListTile(
            leading: const Icon(Icons.info),
            title: const Text('关于'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              showAboutDialog(
                context: context,
                applicationName: 'IM',
                applicationVersion: '1.0.0',
              );
            },
          ),
        ),
      ],
    );
  }

  void _confirmClearCache(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations loc,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.settingsCacheTitle),
        content: Text(loc.settingsCacheMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(loc.commonCancel),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref.read(settingsStateProvider.notifier).clearCache();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(loc.settingsCacheCleared)),
                );
              }
            },
            child: Text(loc.commonConfirm),
          ),
        ],
      ),
    );
  }
}
