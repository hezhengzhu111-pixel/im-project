import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
      padding: const EdgeInsets.all(16),
      children: [
        ProfileHero(user: user, onAvatarTap: () {}),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SettingsSection(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: ValidatedForm(
                      controller: _formController!,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(loc.profileAccountInfo,
                              style: theme.textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 16),
                          TextFormField(
                            initialValue: user.username,
                            decoration:
                                InputDecoration(labelText: loc.profileUsername),
                            enabled: false,
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: _formController!,
                            name: 'nickname',
                            label: loc.profileNickname,
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: _formController!,
                            name: 'email',
                            label: loc.profileEmail,
                            keyboardType: TextInputType.emailAddress,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            initialValue: user.phone,
                            decoration:
                                InputDecoration(labelText: loc.profilePhone),
                            enabled: false,
                          ),
                          const SizedBox(height: 12),
                          Text(loc.profileGender,
                              style: theme.textTheme.bodyMedium),
                          RadioGroup<String>(
                            groupValue: _gender,
                            onChanged: (v) => setState(() => _gender = v ?? ''),
                            child: Row(
                              children: [
                                const Radio<String>(value: 'male'),
                                Text(loc.profileGenderMale),
                                const Radio<String>(value: 'female'),
                                Text(loc.profileGenderFemale),
                                const Radio<String>(value: 'secret'),
                                Text(loc.profileGenderSecret),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
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
                              if (date != null)
                                setState(() => _birthday = date);
                            },
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: _formController!,
                            name: 'signature',
                            label: loc.profileSignature,
                            maxLines: 3,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              FilledButton(
                                onPressed: _save,
                                child: Text(loc.profileSave),
                              ),
                              const SizedBox(width: 12),
                              OutlinedButton(
                                onPressed: _reset,
                                child: Text(loc.profileReset),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            SizedBox(
              width: 340,
              child: Column(
                children: [
                  SettingsSection(
                    title: loc.profileSecurity,
                    children: [
                      ListTile(
                        title: Text(loc.profilePassword),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(loc.profileChange,
                                style: TextStyle(
                                    color: theme.colorScheme.primary)),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const PasswordDialog()),
                      ),
                      Divider(
                          height: 1,
                          color: theme.colorScheme.outlineVariant
                              .withValues(alpha: 0.3)),
                      ListTile(
                        title: Text(loc.profilePhoneVerify),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              user.phone != null
                                  ? loc.profileBound
                                  : loc.profileUnbound,
                              style: TextStyle(
                                  color: user.phone != null
                                      ? Colors.green
                                      : theme.colorScheme.onSurfaceVariant),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const BindPhoneDialog()),
                      ),
                      Divider(
                          height: 1,
                          color: theme.colorScheme.outlineVariant
                              .withValues(alpha: 0.3)),
                      ListTile(
                        title: Text(loc.profileEmailVerify),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              user.email != null
                                  ? loc.profileBound
                                  : loc.profileUnbound,
                              style: TextStyle(
                                  color: user.email != null
                                      ? Colors.green
                                      : theme.colorScheme.onSurfaceVariant),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(
                            context: context,
                            builder: (_) => const BindEmailDialog()),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SettingsSection(
                    title: loc.profilePrivacy,
                    children: [
                      SwitchListTile(
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
}
