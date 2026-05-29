import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/platform/platform_adapter.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'widgets/settings_nav_panel.dart';
import 'widgets/segmented_control.dart';
import 'widgets/settings_section.dart';

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
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    if (context.isMobile) {
      return _buildMobileLayout(loc, theme, settings, authState);
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SettingsNavPanel(),
          const SizedBox(width: 18),
          Expanded(
            child: GlassPanel(
              padding: const EdgeInsets.all(24),
              child: _buildSettingsGrid(loc, theme, settings, authState),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMobileLayout(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
    AuthState authState,
  ) {
    return ListView(
      padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
      children: [
        _buildHero(loc, theme),
        _buildAccountSection(loc, theme, authState),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildPreferencesSection(loc, theme, settings),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildNotificationSection(loc, theme, settings),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildPrivacySection(loc, theme, settings),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildSecondaryColumn(loc, theme),
      ],
    );
  }

  Widget _buildSettingsGrid(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
    AuthState authState,
  ) {
    return ListView(
      children: [
        _buildHero(loc, theme),
        LayoutBuilder(
          builder: (context, constraints) {
            final isTwoColumn = constraints.maxWidth >= 760;
            final children = [
              _buildGroupedSection(
                title: '外观与语言',
                icon: Icons.palette_outlined,
                child: _buildPreferencesSection(loc, theme, settings),
              ),
              _buildGroupedSection(
                title: '消息与隐私',
                icon: Icons.notifications_outlined,
                child: Column(
                  children: [
                    _buildNotificationSection(loc, theme, settings),
                    const SizedBox(height: ImTokens.layoutSectionGap),
                    _buildPrivacySection(loc, theme, settings),
                  ],
                ),
              ),
              _buildGroupedSection(
                title: '安全',
                icon: Icons.shield_outlined,
                child: SettingsSection(
                  children: [
                    SettingsRow(
                      title: loc.settingsClearCache,
                      description: loc.settingsClearCacheDesc,
                      trailing: _SolidActionChip(
                        label: loc.settingsClearCache,
                        onTap: _confirmClearCache,
                      ),
                    ),
                  ],
                ),
              ),
              _buildGroupedSection(
                title: '账号',
                icon: Icons.person_outline,
                child: Column(
                  children: [
                    _buildAccountSection(loc, theme, authState),
                    const SizedBox(height: ImTokens.layoutSectionGap),
                    SettingsSection(
                      children: [
                        Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () => context.push('/settings/ai'),
                            borderRadius:
                                BorderRadius.circular(ImTokens.radiusMd),
                            child: SettingsRow(
                              title: loc.settingsAiAssistant,
                              description: loc.settingsAiAssistantDesc,
                              trailing: Icon(
                                Icons.chevron_right,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ),
                        SettingsRow(
                          title: loc.settingsLogout,
                          trailing: _SolidActionChip(
                            label: loc.settingsLogout,
                            onTap: _confirmLogout,
                            isDestructive: true,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ];

            if (!isTwoColumn) {
              return Column(
                children: [
                  for (final child in children) ...[
                    child,
                    const SizedBox(height: 14),
                  ],
                ],
              );
            }

            return Wrap(
              spacing: 14,
              runSpacing: 14,
              children: children
                  .map(
                    (child) => SizedBox(
                      width: (constraints.maxWidth - 14) / 2,
                      child: child,
                    ),
                  )
                  .toList(),
            );
          },
        ),
      ],
    );
  }

  Widget _buildGroupedSection({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return GlassPanel(
      padding: const EdgeInsets.all(16),
      borderRadius: 20,
      backgroundColor: Colors.white.withValues(alpha: 0.54),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: imGlassBrand, size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _buildHero(AppLocalizations loc, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: ImTokens.layoutSectionGap),
      child: Row(
        children: [
          IconButton(
            onPressed: () => context.go('/chat'),
            icon: const Icon(Icons.arrow_back_ios_new, size: ImTokens.textLg),
          ),
          const SizedBox(width: ImTokens.layoutItemGap),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                loc.settingsTitle,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                loc.settingsSubtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAccountSection(
    AppLocalizations loc,
    ThemeData theme,
    AuthState authState,
  ) {
    final user = authState.user;
    return SettingsSection(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => context.push('/settings/profile'),
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundImage: user?.avatar != null
                        ? NetworkImage(user!.avatar!)
                        : null,
                    child: user?.avatar == null
                        ? Text(
                            (user?.nickname ?? user?.username ?? '?')
                                .substring(0, 1)
                                .toUpperCase(),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.nickname ?? user?.username ?? '',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          loc.settingsProfileDesc,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPreferencesSection(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
  ) {
    return SettingsSection(
      children: [
        SettingsRow(
          title: loc.settingsLanguage,
          description: loc.settingsLanguageDesc,
          trailing: SegmentedControl<String>(
            segments: [
              Segment(label: '中文', value: 'zh'),
              Segment(label: 'English', value: 'en'),
            ],
            value: ref.watch(languageProvider),
            onChanged: (value) {
              ref.read(languageProvider.notifier).state = value;
              getPlatformAdapter().setLocalStorage('app_language', value);
            },
          ),
        ),
        SettingsRow(
          title: loc.settingsTheme,
          description: loc.settingsThemeDesc,
          trailing: SegmentedControl<ThemeMode>(
            segments: [
              Segment(label: loc.settingsThemeLight, value: ThemeMode.light),
              Segment(label: loc.settingsThemeDark, value: ThemeMode.dark),
              Segment(label: loc.settingsThemeAuto, value: ThemeMode.system),
            ],
            value: ref.watch(themeModeProvider),
            onChanged: (value) {
              ref.read(themeModeProvider.notifier).state = value;
              getPlatformAdapter()
                  .setLocalStorage('app_theme_mode', value.name);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildNotificationSection(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
  ) {
    if (settings == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return SettingsSection(
      children: [
        SettingsRow(
          title: loc.settingsNotification,
          trailing: Switch(
            value: settings.message.enableNotification,
            onChanged: (v) {
              _updateMessage(settings.message.copyWith(enableNotification: v));
            },
          ),
        ),
        SettingsRow(
          title: loc.settingsSound,
          trailing: Switch(
            value: settings.message.enableSound,
            onChanged: (v) {
              _updateMessage(settings.message.copyWith(enableSound: v));
            },
          ),
        ),
        SettingsRow(
          title: loc.settingsInsecureVoice,
          description: loc.settingsInsecureVoiceDesc,
          trailing: Switch(
            value: false,
            onChanged: (v) {},
          ),
        ),
      ],
    );
  }

  Widget _buildPrivacySection(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
  ) {
    if (settings == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return SettingsSection(
      children: [
        SettingsRow(
          title: loc.settingsReadReceipt,
          description: loc.settingsReadReceiptDesc,
          trailing: Switch(
            value: settings.privacy.messageReadReceipt,
            onChanged: (v) {
              _updatePrivacy(settings.privacy.copyWith(messageReadReceipt: v));
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSecondaryColumn(AppLocalizations loc, ThemeData theme) {
    return Column(
      children: [
        SettingsSection(
          children: [
            SettingsRow(
              title: loc.settingsClearCache,
              description: loc.settingsClearCacheDesc,
              trailing: _SolidActionChip(
                label: loc.settingsClearCache,
                onTap: _confirmClearCache,
              ),
            ),
          ],
        ),
        const SizedBox(height: ImTokens.layoutSectionGap),
        SettingsSection(
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => context.push('/settings/ai'),
                borderRadius: BorderRadius.circular(ImTokens.radiusMd),
                child: SettingsRow(
                  title: loc.settingsAiAssistant,
                  description: loc.settingsAiAssistantDesc,
                  trailing: Icon(
                    Icons.chevron_right,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: ImTokens.layoutSectionGap),
        SettingsSection(
          children: [
            SettingsRow(
              title: loc.settingsLogout,
              trailing: _SolidActionChip(
                label: loc.settingsLogout,
                onTap: _confirmLogout,
                isDestructive: true,
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _updatePrivacy(PrivacySettings privacy) {
    ref.read(settingsStateProvider.notifier).updatePrivacySettings(privacy);
  }

  void _updateMessage(MessagePreferenceSettings message) {
    ref.read(settingsStateProvider.notifier).updateMessageSettings(message);
  }

  void _confirmClearCache() {
    final loc = AppLocalizations.of(context)!;
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
          PrimarySolidButton(
            label: loc.commonConfirm,
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(settingsStateProvider.notifier).clearCache();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(loc.settingsCacheCleared)),
              );
            },
          ),
        ],
      ),
    );
  }

  void _confirmLogout() {
    final loc = AppLocalizations.of(context)!;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.settingsLogoutTitle),
        content: Text(loc.settingsLogoutMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(loc.commonCancel),
          ),
          PrimarySolidButton(
            label: loc.commonConfirm,
            onPressed: () async {
              Navigator.pop(ctx);
              await ref.read(authStateProvider.notifier).logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
        ],
      ),
    );
  }
}

/// 渐变胶囊操作按钮，用于卡片内的操作触发。
class _SolidActionChip extends StatelessWidget {
  const _SolidActionChip({
    required this.label,
    required this.onTap,
    this.isDestructive = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isDestructive ? const Color(0xFFF44336) : imGlassBrand,
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
          boxShadow: [
            BoxShadow(
              color: (isDestructive ? const Color(0xFFF44336) : imGlassBrand)
                  .withValues(alpha: 0.22),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
