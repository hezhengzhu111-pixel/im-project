import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_shared_features/auth.dart';
import '../presentation/settings_providers.dart';
import 'widgets/bind_email_dialog.dart';
import 'widgets/bind_phone_dialog.dart';
import 'widgets/password_dialog.dart';
import 'widgets/profile_hero.dart';
import 'widgets/settings_section.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _nicknameController = TextEditingController();
  final _emailController = TextEditingController();
  final _signatureController = TextEditingController();
  final _locationController = TextEditingController();
  String _gender = '';
  DateTime? _birthday;
  bool _initialized = false;

  @override
  void dispose() {
    _nicknameController.dispose();
    _emailController.dispose();
    _signatureController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _initControllers(User user) {
    if (_initialized) return;
    _nicknameController.text = user.nickname ?? '';
    _emailController.text = user.email ?? '';
    _signatureController.text = user.signature ?? '';
    _locationController.text = user.location ?? '';
    _gender = user.gender ?? '';
    _birthday =
        user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    _initialized = true;
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final profileState = ref.watch(profileStateProvider);
    final user = authState.user;
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }

    _initControllers(user);

    return ListView(
      padding: const EdgeInsets.all(ImTokens.space4),
      children: [
        // ── 头像卡片 ──
        SettingsSection(
          padding: const EdgeInsets.all(ImTokens.space5),
          children: [
            ProfileHero(
              user: user,
              onAvatarTap: () => _pickAndUploadAvatar(user),
            ),
          ],
        ),
        const SizedBox(height: ImTokens.layoutSectionGap),
        // ── 双栏布局 ──
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── 左栏：基本信息表单 ──
            Expanded(
              child: SettingsSection(
                padding: const EdgeInsets.all(ImTokens.space5),
                children: [
                  Text(loc.profileAccountInfo,
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 16),
                  Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextFormField(
                          initialValue: user.username,
                          decoration:
                              InputDecoration(labelText: loc.profileUsername),
                          enabled: false,
                        ),
                        const SizedBox(height: ImTokens.space3),
                        TextFormField(
                          controller: _nicknameController,
                          decoration:
                              InputDecoration(labelText: loc.profileNickname),
                          validator: (value) {
                            final text = value?.trim() ?? '';
                            if (text.isEmpty) {
                              return loc.validationNicknameRequired;
                            }
                            if (text.length > 20) {
                              return loc.validationNicknameMaxLength(20);
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: ImTokens.space3),
                        TextFormField(
                          controller: _emailController,
                          decoration:
                              InputDecoration(labelText: loc.profileEmail),
                          keyboardType: TextInputType.emailAddress,
                          validator: (value) {
                            final text = value?.trim() ?? '';
                            if (text.isNotEmpty &&
                                !RegExp(r'^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$')
                                    .hasMatch(text)) {
                              return loc.validationEmailInvalid;
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: ImTokens.space3),
                        TextFormField(
                          initialValue: user.phone,
                          decoration:
                              InputDecoration(labelText: loc.profilePhone),
                          enabled: false,
                        ),
                        const SizedBox(height: ImTokens.space3),
                        Text(loc.profileGender,
                            style: theme.textTheme.bodyMedium),
                        SegmentedButton<String>(
                          segments: [
                            ButtonSegment(
                              value: 'male',
                              label: Text(loc.profileGenderMale),
                            ),
                            ButtonSegment(
                              value: 'female',
                              label: Text(loc.profileGenderFemale),
                            ),
                            ButtonSegment(
                              value: 'secret',
                              label: Text(loc.profileGenderSecret),
                            ),
                          ],
                          selected: {_gender.isEmpty ? 'secret' : _gender},
                          onSelectionChanged: (values) {
                            setState(() => _gender = values.first);
                          },
                        ),
                        const SizedBox(height: ImTokens.space3),
                        Material(
                          color: Colors.transparent,
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(loc.profileBirthday),
                            subtitle: Text(_birthday != null
                                ? '${_birthday!.year}-${_birthday!.month.toString().padLeft(2, '0')}-${_birthday!.day.toString().padLeft(2, '0')}'
                                : loc.profileBirthday),
                            trailing: const Icon(Icons.calendar_today),
                            onTap: () async {
                              final date = await showDatePicker(
                                context: context,
                                initialDate: _birthday ?? DateTime(2000),
                                firstDate: DateTime(1950),
                                lastDate: DateTime.now(),
                              );
                              if (date != null) setState(() => _birthday = date);
                            },
                          ),
                        ),
                        const SizedBox(height: ImTokens.space3),
                        TextFormField(
                          controller: _signatureController,
                          decoration:
                              InputDecoration(labelText: loc.profileSignature),
                          maxLines: 3,
                        ),
                        const SizedBox(height: ImTokens.space3),
                        TextFormField(
                          controller: _locationController,
                          decoration:
                              InputDecoration(labelText: loc.profileLocation),
                        ),
                        const SizedBox(height: 20),
                        // ── 渐变保存按钮 + 重置按钮 ──
                        Row(
                          children: [
                            _buildGradientSaveButton(loc, profileState.saving),
                            const SizedBox(width: ImTokens.space3),
                            OutlinedButton(
                              onPressed: _reset,
                              child: Text(loc.profileReset),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: ImTokens.layoutSectionGap),
            // ── 右栏：安全 & 隐私 ──
            SizedBox(
              width: 340,
              child: Column(
                children: [
                  // ── 安全设置卡片 ──
                  SettingsSection(
                    title: loc.profileSecurity,
                    children: [
                      _SecurityTile(
                        title: loc.profilePassword,
                        trailing: loc.profileChange,
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const PasswordDialog()),
                      ),
                      _SecurityTile(
                        title: loc.profilePhoneVerify,
                        trailing: user.phone != null
                            ? loc.profileBound
                            : loc.profileUnbound,
                        trailingColor: user.phone != null
                            ? theme.colorScheme.primary
                            : theme.colorScheme.onSurfaceVariant,
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const BindPhoneDialog()),
                      ),
                      _SecurityTile(
                        title: loc.profileEmailVerify,
                        trailing: user.email != null
                            ? loc.profileBound
                            : loc.profileUnbound,
                        trailingColor: user.email != null
                            ? theme.colorScheme.primary
                            : theme.colorScheme.onSurfaceVariant,
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const BindEmailDialog()),
                      ),
                    ],
                  ),
                  const SizedBox(height: ImTokens.layoutSectionGap),
                  // ── 隐私设置卡片 ──
                  SettingsSection(
                    title: loc.profilePrivacy,
                    children: [
                      Material(
                        color: Colors.transparent,
                        child: SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(loc.profileAllowStrangerAdd),
                          subtitle: Text(loc.profileAllowStrangerAddDesc,
                              style: const TextStyle(fontSize: 12)),
                          value: ref
                                  .watch(settingsStateProvider)
                                  ?.privacy
                                  .allowStrangerAdd ??
                              false,
                          onChanged: (v) {
                            final s = ref.read(settingsStateProvider);
                            if (s != null) {
                              ref
                                  .read(settingsStateProvider.notifier)
                                  .updatePrivacySettings(
                                    s.privacy.copyWith(allowStrangerAdd: v),
                                  );
                            }
                          },
                        ),
                      ),
                      Material(
                        color: Colors.transparent,
                        child: SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(loc.profileShowOnlineStatus),
                          subtitle: Text(loc.profileShowOnlineStatusDesc,
                              style: const TextStyle(fontSize: 12)),
                          value: ref
                                  .watch(settingsStateProvider)
                                  ?.privacy
                                  .showOnlineStatus ??
                              false,
                          onChanged: (v) {
                            final s = ref.read(settingsStateProvider);
                            if (s != null) {
                              ref
                                  .read(settingsStateProvider.notifier)
                                  .updatePrivacySettings(
                                    s.privacy.copyWith(showOnlineStatus: v),
                                  );
                            }
                          },
                        ),
                      ),
                      Material(
                        color: Colors.transparent,
                        child: SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(loc.profileAllowViewMoments),
                          subtitle: Text(loc.profileAllowViewMomentsDesc,
                              style: const TextStyle(fontSize: 12)),
                          value: ref
                                  .watch(settingsStateProvider)
                                  ?.privacy
                                  .allowViewMoments ??
                              false,
                          onChanged: (v) {
                            final s = ref.read(settingsStateProvider);
                            if (s != null) {
                              ref
                                  .read(settingsStateProvider.notifier)
                                  .updatePrivacySettings(
                                    s.privacy.copyWith(allowViewMoments: v),
                                  );
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildGradientSaveButton(AppLocalizations loc, bool saving) {
    return GestureDetector(
      onTap: saving ? null : _save,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        decoration: BoxDecoration(
          color: imGlassBrand,
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
          boxShadow: [
            BoxShadow(
              color: imGlassBrand.withValues(alpha: 0.24),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: saving
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                loc.profileSave,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
      ),
    );
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final loc = AppLocalizations.of(context)!;
    try {
      await ref.read(profileStateProvider.notifier).updateProfile(
            UpdateProfileRequest(
              nickname: _nicknameController.text.trim(),
              email: _emailController.text.trim(),
              gender: _gender,
              birthday: _birthday?.toIso8601String(),
              signature: _signatureController.text.trim(),
              location: _locationController.text.trim(),
            ),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.profileSaved)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.profileUpdateFailed)),
        );
      }
    }
  }

  void _reset() {
    final user = ref.read(authStateProvider).user;
    if (user == null) return;
    _formKey.currentState?.reset();
    setState(() {
      _nicknameController.text = user.nickname ?? '';
      _emailController.text = user.email ?? '';
      _signatureController.text = user.signature ?? '';
      _locationController.text = user.location ?? '';
      _gender = user.gender ?? '';
      _birthday =
          user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    });
  }

  Future<void> _pickAndUploadAvatar(User currentUser) async {
    final result = await ref
        .read(filePickerPortProvider)
        .pickImage(source: ImageSource.gallery);

    if (result is! Success<PickedFile>) return;

    final file = result.data;
    final loc = AppLocalizations.of(context)!;

    if (!_isSupportedImage(file.mimeType)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarUnsupportedFormat)),
      );
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarSizeExceeded)),
      );
      return;
    }

    try {
      final updatedUser = await ref
          .read(profileStateProvider.notifier)
          .uploadAvatar(file.bytes, file.name, currentUser: currentUser);
      ref.read(authStateProvider.notifier).updateUser(updatedUser);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarUpdateSuccess)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.profileUploadFailed)),
      );
    }
  }

  bool _isSupportedImage(String? mimeType) {
    if (mimeType == null) return false;
    const supported = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'};
    return supported.contains(mimeType.toLowerCase());
  }
}

/// 安全设置行：无分割线，右侧带"修改 >"文字。
class _SecurityTile extends StatelessWidget {
  const _SecurityTile({
    required this.title,
    required this.trailing,
    this.trailingColor,
    required this.onTap,
  });

  final String title;
  final String trailing;
  final Color? trailingColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(ImTokens.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Text(
              trailing,
              style: TextStyle(
                color: trailingColor ?? theme.colorScheme.primary,
                fontSize: 13,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right,
              size: 18,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}
