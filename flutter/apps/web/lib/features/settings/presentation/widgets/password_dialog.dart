import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';

class PasswordDialog extends ConsumerStatefulWidget {
  const PasswordDialog({super.key});

  @override
  ConsumerState<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends ConsumerState<PasswordDialog> {
  late final FormController _formController;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    final loc = AppLocalizations.of(context)!;
    _formController = FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'currentPassword',
        initialValue: '',
        validators: [
          FormValidators.required(loc.profileCurrentPasswordRequired),
        ],
      ),
      FormFieldSchema(
        name: 'newPassword',
        initialValue: '',
        validators: [
          FormValidators.required(loc.profileNewPasswordRequired),
          FormValidators.minLength(8, loc.validatorPasswordLength),
          FormValidators.maxLength(64, loc.validatorPasswordLength),
          FormValidators.passwordStrength(loc.validatorPasswordFormat),
        ],
      ),
      FormFieldSchema(
        name: 'confirmPassword',
        initialValue: '',
        validators: [
          FormValidators.required(loc.validatorConfirmPasswordRequired),
          (value) {
            final pw = _formController.field('newPassword').value;
            if (value != pw) return loc.validatorPasswordMismatch;
            return null;
          },
        ],
      ),
    ]));
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(loc.profileChangePassword),
      content: ValidatedForm(
        controller: _formController,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValidatedFormField(
              controller: _formController,
              name: 'currentPassword',
              label: loc.profileCurrentPassword,
              obscureText: true,
            ),
            const SizedBox(height: 12),
            ValidatedFormField(
              controller: _formController,
              name: 'newPassword',
              label: loc.profileNewPassword,
              obscureText: true,
            ),
            const SizedBox(height: 12),
            ValidatedFormField(
              controller: _formController,
              name: 'confirmPassword',
              label: loc.profileConfirmPassword,
              obscureText: true,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(loc.commonCancel),
        ),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(loc.commonConfirm),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (!await _formController.validate()) return;
    setState(() => _loading = true);
    try {
      final values = _formController.values;
      await ref.read(profileStateProvider.notifier).changePassword(
            ChangePasswordRequest(
              currentPassword: values['currentPassword']!,
              newPassword: values['newPassword']!,
            ),
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text(AppLocalizations.of(context)!.profilePasswordUpdated)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}
