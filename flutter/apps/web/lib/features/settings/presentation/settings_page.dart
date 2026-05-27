import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_core/core.dart';
import '../../auth/presentation/auth_provider.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(settingsStateProvider.notifier).loadSettings();
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsStateProvider);
    final authState = ref.watch(authStateProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Profile section
        _buildProfileSection(authState),
        const SizedBox(height: 24),

        // General settings
        Text('通用设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: settings != null
              ? Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.language),
                      title: const Text('语言'),
                      trailing: Text(settings.general.language),
                    ),
                    ListTile(
                      leading: const Icon(Icons.palette),
                      title: const Text('主题'),
                      trailing: Text(_themeLabel(settings.general.theme)),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.login),
                      title: const Text('自动登录'),
                      value: settings.general.autoLogin,
                      onChanged: (v) => _updateGeneral(
                        settings.general.copyWith(autoLogin: v),
                      ),
                    ),
                  ],
                )
              : const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
        ),
        const SizedBox(height: 24),

        // Privacy settings
        Text('隐私设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: settings != null
              ? Column(
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.person_add),
                      title: const Text('允许陌生人添加'),
                      value: settings.privacy.allowStrangerAdd,
                      onChanged: (v) => _updatePrivacy(
                        settings.privacy.copyWith(allowStrangerAdd: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.visibility),
                      title: const Text('显示在线状态'),
                      value: settings.privacy.showOnlineStatus,
                      onChanged: (v) => _updatePrivacy(
                        settings.privacy.copyWith(showOnlineStatus: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.camera_alt),
                      title: const Text('允许查看朋友圈'),
                      value: settings.privacy.allowViewMoments,
                      onChanged: (v) => _updatePrivacy(
                        settings.privacy.copyWith(allowViewMoments: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.done_all),
                      title: const Text('消息已读回执'),
                      value: settings.privacy.messageReadReceipt,
                      onChanged: (v) => _updatePrivacy(
                        settings.privacy.copyWith(messageReadReceipt: v),
                      ),
                    ),
                  ],
                )
              : const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
        ),
        const SizedBox(height: 24),

        // Notification settings
        Text('通知设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: settings != null
              ? Column(
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.notifications),
                      title: const Text('消息通知'),
                      value: settings.message.enableNotification,
                      onChanged: (v) => _updateMessage(
                        settings.message.copyWith(enableNotification: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.volume_up),
                      title: const Text('声音'),
                      value: settings.message.enableSound,
                      onChanged: (v) => _updateMessage(
                        settings.message.copyWith(enableSound: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.vibration),
                      title: const Text('震动'),
                      value: settings.message.enableVibration,
                      onChanged: (v) => _updateMessage(
                        settings.message.copyWith(enableVibration: v),
                      ),
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.group_off),
                      title: const Text('消息免打扰'),
                      value: settings.message.muteGroupMessages,
                      onChanged: (v) => _updateMessage(
                        settings.message.copyWith(muteGroupMessages: v),
                      ),
                    ),
                  ],
                )
              : const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
        ),
        const SizedBox(height: 24),

        // Account actions
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.lock_outline),
                title: const Text('修改密码'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  // TODO: navigate to change password
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: Icon(
                  Icons.logout,
                  color: Theme.of(context).colorScheme.error,
                ),
                title: Text(
                  '退出登录',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
                onTap: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('确认退出'),
                      content: const Text('确定要退出登录吗？'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('取消'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('退出'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    await ref.read(authStateProvider.notifier).logout();
                    if (context.mounted) {
                      context.go('/login');
                    }
                  }
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildProfileSection(AuthState authState) {
    final user = authState.user;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundImage: user?.avatar != null
                  ? NetworkImage(user!.avatar!)
                  : null,
              child: user?.avatar == null
                  ? Text(
                      (user?.nickname ?? user?.username ?? '?')
                          .substring(0, 1)
                          .toUpperCase(),
                      style: const TextStyle(fontSize: 24),
                    )
                  : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user?.nickname ?? user?.username ?? '未登录',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user?.signature ?? '这个人很懒，什么都没写',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'ID: ${user?.username ?? '-'}',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () {
                // TODO: edit profile
              },
              icon: const Icon(Icons.edit),
            ),
          ],
        ),
      ),
    );
  }

  void _updateGeneral(GeneralSettings general) {
    final current = ref.read(settingsStateProvider);
    if (current == null) return;
    ref.read(settingsStateProvider.notifier).updateSettings(
          current.copyWith(general: general),
        );
  }

  void _updatePrivacy(PrivacySettings privacy) {
    final current = ref.read(settingsStateProvider);
    if (current == null) return;
    ref.read(settingsStateProvider.notifier).updateSettings(
          current.copyWith(privacy: privacy),
        );
  }

  void _updateMessage(MessagePreferenceSettings message) {
    final current = ref.read(settingsStateProvider);
    if (current == null) return;
    ref.read(settingsStateProvider.notifier).updateSettings(
          current.copyWith(message: message),
        );
  }

  String _themeLabel(String theme) {
    switch (theme) {
      case 'light':
        return '浅色';
      case 'dark':
        return '深色';
      case 'system':
      default:
        return '跟随系统';
    }
  }
}
