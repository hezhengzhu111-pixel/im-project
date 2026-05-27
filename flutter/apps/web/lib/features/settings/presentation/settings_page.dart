import 'package:flutter/material.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('通用设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              ListTile(title: const Text('语言'), trailing: const Text('简体中文')),
              ListTile(title: const Text('主题'), trailing: const Text('跟随系统')),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text('隐私设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              SwitchListTile(title: const Text('允许陌生人添加'), value: true, onChanged: (_) {}),
              SwitchListTile(title: const Text('显示在线状态'), value: true, onChanged: (_) {}),
            ],
          ),
        ),
      ],
    );
  }
}
