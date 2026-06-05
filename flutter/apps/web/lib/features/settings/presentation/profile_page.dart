import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/features/settings/presentation/widgets/profile_hero.dart';
import 'package:im_web/features/settings/presentation/widgets/settings_section.dart';
import 'package:im_web/features/settings/presentation/widgets/password_dialog.dart';
import 'package:im_web/features/settings/presentation/widgets/bind_phone_dialog.dart';
import 'package:im_web/features/settings/presentation/widgets/bind_email_dialog.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  FormController? _formController;
  String _gender = '';
  DateTime? _birthday;
  bool _initialized = false;

  void _initControllers(User user) {
    if (_initialized) return;
    final loc = AppLocalizations.of(context)!;
    _formController = FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'nickname',
        initialValue: user.nickname ?? '',
        validators: [
          FormValidators.required(loc.validationNicknameRequired),
          FormValidators.maxLength(20, loc.validationNicknameMaxLength(20)),
        ],
      ),
      FormFieldSchema(
        name: 'email',
        initialValue: user.email ?? '',
        validators: [
          FormValidators.email(loc.validationEmailInvalid),
        ],
      ),
      FormFieldSchema(
        name: 'signature',
        initialValue: user.signature ?? '',
      ),
      FormFieldSchema(
        name: 'location',
        initialValue: user.location ?? '',
      ),
    ]));
    _gender = user.gender ?? '';
    _birthday =
        user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    _initialized = true;
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
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
                  ValidatedForm(
                    controller: _formController!,
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
                        ValidatedFormField(
                          controller: _formController!,
                          name: 'nickname',
                          label: loc.profileNickname,
                        ),
                        const SizedBox(height: ImTokens.space3),
                        ValidatedFormField(
                          controller: _formController!,
                          name: 'email',
                          label: loc.profileEmail,
                          keyboardType: TextInputType.emailAddress,
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
                        ListTile(
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
                        const SizedBox(height: ImTokens.space3),
                        ValidatedFormField(
                          controller: _formController!,
                          name: 'signature',
                          label: loc.profileSignature,
                          maxLines: 3,
                        ),
                        const SizedBox(height: 20),
                        // ── 渐变保存按钮 + 重置按钮 ──
                        Row(
                          children: [
                            _buildGradientSaveButton(loc),
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
                      SwitchListTile(
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
                      SwitchListTile(
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
                      SwitchListTile(
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

  Widget _buildGradientSaveButton(AppLocalizations loc) {
    return GestureDetector(
      onTap: _save,
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
        child: Text(
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
    if (!await _formController!.validate()) return;
    final values = _formController!.values;
    final loc = AppLocalizations.of(context)!;
    try {
      await ref.read(profileStateProvider.notifier).updateProfile(
            UpdateProfileRequest(
              nickname: values['nickname']?.trim(),
              email: values['email']?.trim(),
              gender: _gender,
              birthday: _birthday?.toIso8601String(),
              signature: values['signature']?.trim(),
              location: values['location']?.trim(),
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
    _formController?.reset();
    setState(() {
      _gender = user.gender ?? '';
      _birthday =
          user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    });
  }

  Future<void> _pickAndUploadAvatar(User currentUser) async {
    final result = await FilePicker.pickFiles(
      type: FileType.image,
    );

    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    if (file.bytes == null) return;

    final ext = (file.extension ?? '').toLowerCase();

    final loc = AppLocalizations.of(context)!;

    // 验证文件类型
    if (!['jpg', 'jpeg', 'png', 'gif'].contains(ext)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarUnsupportedFormat)),
      );
      return;
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarSizeExceeded)),
      );
      return;
    }

    try {
      final avatarUrl = await ref
          .read(settingsApiProvider)
          .uploadAvatar(file.bytes!, file.name);
      // 更新用户头像
      await ref.read(profileStateProvider.notifier).updateProfile(
            UpdateProfileRequest(avatar: avatarUrl),
          );
      // 同步更新 authState
      ref.read(authStateProvider.notifier).updateUser(
            currentUser.copyWith(avatar: avatarUrl),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarUpdateSuccess)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.avatarUploadFailed(e.toString()))),
      );
    }
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
