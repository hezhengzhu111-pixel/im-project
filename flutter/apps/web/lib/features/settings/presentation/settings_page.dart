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
      padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SettingsNavPanel(),
          const SizedBox(width: ImTokens.layoutPanelPadding),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _buildPrimaryColumn(loc, theme, settings, authState),
                ),
                if (context.isLarge) ...[
                  const SizedBox(width: ImTokens.layoutPanelPadding),
                  SizedBox(
                    width: ImTokens.layoutSettingsAsideWidth,
                    child: _buildSecondaryColumn(loc, theme),
                  ),
                ],
              ],
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

  Widget _buildPrimaryColumn(
    AppLocalizations loc,
    ThemeData theme,
    dynamic settings,
    AuthState authState,
  ) {
    return ListView(
      children: [
        _buildHero(loc, theme),
        _buildAccountSection(loc, theme, authState),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildPreferencesSection(loc, theme, settings),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildNotificationSection(loc, theme, settings),
        const SizedBox(height: ImTokens.layoutSectionGap),
        _buildPrivacySection(loc, theme, settings),
      ],
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
            child: Padding(
              padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
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
              getPlatformAdapter().setLocalStorage('app_theme_mode', value.name);
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
          showDivider: false,
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
          showDivider: false,
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
              showDivider: false,
              trailing: OutlinedButton(
                onPressed: _confirmClearCache,
                child: Text(loc.settingsClearCache),
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
                child: SettingsRow(
                  title: loc.settingsAiAssistant,
                  description: loc.settingsAiAssistantDesc,
                  showDivider: false,
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
              showDivider: false,
              trailing: OutlinedButton(
                onPressed: _confirmLogout,
                child: Text(loc.settingsLogout),
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
          GradientButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(settingsStateProvider.notifier).clearCache();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(loc.settingsCacheCleared)),
              );
            },
            child: Text(loc.commonConfirm),
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
          GradientButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref.read(authStateProvider.notifier).logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
            child: Text(loc.commonConfirm),
          ),
        ],
      ),
    );
  }
}
