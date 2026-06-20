import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_shared_features/auth.dart';
import '../presentation/settings_providers.dart';
import 'widgets/delete_account_dialog.dart';
import 'widgets/segmented_control.dart';
import 'widgets/settings_nav_panel.dart';
import 'widgets/settings_section.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(settingsStateProvider.notifier).loadSettings();
    });
  }

  void _onNavItemSelected(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsStateProvider);
    final authState = ref.watch(authStateProvider);
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    if (context.isMobile) {
      return ColoredBox(
        color: ImTokens.wechatPageBg,
        child: _buildMobileLayout(loc, theme, settings, authState),
      );
    }

    return ColoredBox(
      color: ImTokens.wechatPageBg,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SettingsNavPanel(
              selectedIndex: _selectedIndex,
              onItemSelected: _onNavItemSelected,
            ),
            const SizedBox(width: 18),
            Expanded(
              child: GlassPanel(
                padding: const EdgeInsets.all(24),
                child: IndexedStack(
                  index: _selectedIndex,
                  children: [
                    _buildAccountPage(loc, theme, authState),
                    _buildAppearancePage(loc, theme, settings),
                    _buildNotificationPage(loc, theme, settings),
                    _buildSecurityPage(loc, theme, settings),
                    _buildAISettingsPage(loc, theme),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMobileLayout(
    AppLocalizations loc,
    ThemeData theme,
    UserSettings? settings,
    AuthState authState,
  ) {
    return Scaffold(
      appBar: AppBar(
        title: Text(loc.settingsTitle),
        backgroundColor: Colors.white,
        foregroundColor: theme.colorScheme.onSurface,
        elevation: 0,
      ),
      backgroundColor: ImTokens.wechatPageBg,
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          _buildAccountPage(loc, theme, authState),
          const SizedBox(height: 24),
          _buildAppearancePage(loc, theme, settings),
          const SizedBox(height: 24),
          _buildNotificationPage(loc, theme, settings),
          const SizedBox(height: 24),
          _buildSecurityPage(loc, theme, settings),
          const SizedBox(height: 24),
          _buildAISettingsPage(loc, theme),
        ],
      ),
    );
  }

  Widget _buildAccountPage(
    AppLocalizations loc,
    ThemeData theme,
    AuthState authState,
  ) {
    final user = authState.user;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loc.accountTitle,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        const SizedBox(height: 12),
        SettingsSection(
          children: [
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(loc.accountProfile),
              subtitle: Text(loc.accountProfileDesc),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile'),
            ),
            const Divider(height: 1, indent: 56),
            ListTile(
              leading: const Icon(Icons.lock_outline),
              title: Text(loc.accountPassword),
              subtitle: Text(loc.accountPasswordDesc),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile'),
            ),
            const Divider(height: 1, indent: 56),
            ListTile(
              leading: Icon(Icons.logout, color: theme.colorScheme.error),
              title: Text(loc.accountLogout),
              onTap: () => _showLogoutConfirm(context),
            ),
            const Divider(height: 1, indent: 56),
            ListTile(
              leading: Icon(Icons.delete_forever,
                  color: theme.colorScheme.error),
              title: Text(
                loc.accountDelete,
                style: TextStyle(color: theme.colorScheme.error),
              ),
              onTap: () => showDialog(
                context: context,
                builder: (ctx) => const DeleteAccountDialog(),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (user != null) _buildUserInfoCard(loc, theme, user),
      ],
    );
  }

  Widget _buildUserInfoCard(
    AppLocalizations loc,
    ThemeData theme,
    User user,
  ) {
    return GlassPanel(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ImAvatar(
            imageUrl: user.avatar,
            name: user.nickname ?? user.username,
            size: 72,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.nickname ?? user.username,
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  '@${user.username}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    _buildInfoChip(theme, loc.accountId, user.id),
                    if (user.phone != null)
                      _buildInfoChip(theme, loc.accountPhone, user.phone!),
                    if (user.email != null)
                      _buildInfoChip(theme, loc.accountEmail, user.email!),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoChip(ThemeData theme, String label, String value) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: theme.colorScheme.surfaceContainerHighest,
      label: Text(
        '$label: $value',
        style: TextStyle(
          fontSize: 11,
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }

  Widget _buildAppearancePage(
    AppLocalizations loc,
    ThemeData theme,
    UserSettings? settings,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loc.appearanceTitle,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        const SizedBox(height: 12),
        SettingsSection(
          title: loc.appearanceTheme,
          children: [
            _buildThemeSelector(loc, theme, settings?.general.theme),
          ],
        ),
        const SizedBox(height: 16),
        SettingsSection(
          title: loc.appearanceLanguage,
          children: [
            _buildLanguageSelector(loc, theme, settings?.general.language),
          ],
        ),
      ],
    );
  }

  Widget _buildThemeSelector(
    AppLocalizations loc,
    ThemeData theme,
    String? current,
  ) {
    final value = current ?? 'system';
    return SegmentedControl<String>(
      value: value,
      segments: [
        Segment(label: loc.themeLight, value: 'light'),
        Segment(label: loc.themeDark, value: 'dark'),
        Segment(label: loc.themeSystem, value: 'system'),
      ],
      onChanged: (themeValue) {
        final s = ref.read(settingsStateProvider);
        if (s == null) return;
        final mode = _parseThemeMode(themeValue);
        ref.read(themeModeProvider.notifier).state = mode;
        ref.read(settingsStateProvider.notifier).updateGeneralSettings(
              s.general.copyWith(theme: themeValue),
            );
      },
    );
  }

  ThemeMode _parseThemeMode(String value) {
    switch (value) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }

  Widget _buildLanguageSelector(
    AppLocalizations loc,
    ThemeData theme,
    String? language,
  ) {
    final options = [
      Segment(label: loc.languageChinese, value: 'zh'),
      Segment(label: loc.languageEnglish, value: 'en'),
    ];
    return SegmentedControl<String>(
      value: language ?? 'zh',
      segments: options,
      onChanged: (lang) {
        final s = ref.read(settingsStateProvider);
        if (s == null) return;
        ref.read(languageProvider.notifier).state = lang;
        ref.read(settingsStateProvider.notifier).updateGeneralSettings(
              s.general.copyWith(language: lang),
            );
      },
    );
  }

  Widget _buildNotificationPage(
    AppLocalizations loc,
    ThemeData theme,
    UserSettings? settings,
  ) {
    final message = settings?.message;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loc.notificationTitle,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        const SizedBox(height: 12),
        SettingsSection(
          children: [
            SwitchListTile(
              title: Text(loc.notificationEnable),
              subtitle: Text(loc.notificationEnableDesc),
              value: message?.enableNotification ?? false,
              onChanged: (v) {
                if (message != null) {
                  ref
                      .read(settingsStateProvider.notifier)
                      .updateMessageSettings(
                        message.copyWith(enableNotification: v),
                      );
                }
              },
            ),
            const Divider(height: 1),
            SwitchListTile(
              title: Text(loc.notificationSound),
              value: message?.enableSound ?? false,
              onChanged: (v) {
                if (message != null) {
                  ref
                      .read(settingsStateProvider.notifier)
                      .updateMessageSettings(
                        message.copyWith(enableSound: v),
                      );
                }
              },
            ),
            const Divider(height: 1),
            SwitchListTile(
              title: Text(loc.notificationVibrate),
              value: message?.enableVibration ?? false,
              onChanged: (v) {
                if (message != null) {
                  ref
                      .read(settingsStateProvider.notifier)
                      .updateMessageSettings(
                        message.copyWith(enableVibration: v),
                      );
                }
              },
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSecurityPage(
    AppLocalizations loc,
    ThemeData theme,
    UserSettings? settings,
  ) {
    final privacy = settings?.privacy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loc.securityTitle,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        const SizedBox(height: 12),
        SettingsSection(
          title: loc.securityPrivacy,
          children: [
            SwitchListTile(
              title: Text(loc.securityAddFriend),
              subtitle: Text(loc.securityAddFriendDesc),
              value: privacy?.allowStrangerAdd ?? false,
              onChanged: (v) {
                if (privacy != null) {
                  ref
                      .read(settingsStateProvider.notifier)
                      .updatePrivacySettings(
                        privacy.copyWith(allowStrangerAdd: v),
                      );
                }
              },
            ),
            const Divider(height: 1),
            SwitchListTile(
              title: Text(loc.securityOnlineStatus),
              value: privacy?.showOnlineStatus ?? false,
              onChanged: (v) {
                if (privacy != null) {
                  ref
                      .read(settingsStateProvider.notifier)
                      .updatePrivacySettings(
                        privacy.copyWith(showOnlineStatus: v),
                      );
                }
              },
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAISettingsPage(AppLocalizations loc, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loc.aiTitle,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        const SizedBox(height: 12),
        SettingsSection(
          children: [
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: Text(loc.aiAssistant),
              subtitle: Text(loc.aiComingSoon),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {},
            ),
          ],
        ),
      ],
    );
  }

  void _showLogoutConfirm(BuildContext ctx) {
    final loc = AppLocalizations.of(ctx)!;
    showDialog(
      context: ctx,
      builder: (ctx) => AlertDialog(
        title: Text(loc.logoutConfirmTitle),
        content: Text(loc.logoutConfirmMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(loc.commonCancel),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(authStateProvider.notifier).logout();
              ctx.go('/login');
            },
            child: Text(loc.logoutConfirmAction),
          ),
        ],
      ),
    );
  }
}
