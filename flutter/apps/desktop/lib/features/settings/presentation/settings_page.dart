import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/di/platform_providers.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final language = ref.watch(languageProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          '设置',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),

        // Theme
        Card(
          child: ListTile(
            leading: const Icon(Icons.brightness_6),
            title: const Text('主题'),
            trailing: DropdownButton<ThemeMode>(
              value: themeMode,
              items: const [
                DropdownMenuItem(value: ThemeMode.system, child: Text('跟随系统')),
                DropdownMenuItem(value: ThemeMode.light, child: Text('浅色')),
                DropdownMenuItem(value: ThemeMode.dark, child: Text('深色')),
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
            title: const Text('语言'),
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
            title: const Text('个人资料'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/profile'),
          ),
        ),

        // AI Settings
        Card(
          child: ListTile(
            leading: const Icon(Icons.smart_toy),
            title: const Text('AI 设置'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/ai'),
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
                applicationName: 'IM Desktop',
                applicationVersion: '1.0.0',
              );
            },
          ),
        ),
      ],
    );
  }
}
