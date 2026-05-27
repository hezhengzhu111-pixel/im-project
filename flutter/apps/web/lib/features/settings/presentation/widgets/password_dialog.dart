import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';

class PasswordDialog extends ConsumerStatefulWidget {
  const PasswordDialog({super.key});

  @override
  ConsumerState<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends ConsumerState<PasswordDialog> {
  final _formKey = GlobalKey<FormState>();
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(loc.profileChangePassword),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _currentController,
              obscureText: true,
              decoration: InputDecoration(labelText: loc.profileCurrentPassword),
              validator: (v) => v?.isEmpty == true ? loc.profileCurrentPasswordRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _newController,
              obscureText: true,
              decoration: InputDecoration(labelText: loc.profileNewPassword),
              validator: (v) {
                if (v == null || v.isEmpty) return loc.profileNewPasswordRequired;
                if (v.length < 6 || v.length > 20) return loc.profilePasswordLength;
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _confirmController,
              obscureText: true,
              decoration: InputDecoration(labelText: loc.profileConfirmPassword),
              validator: (v) {
                if (v != _newController.text) return loc.profilePasswordMismatch;
                return null;
              },
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
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(loc.commonConfirm),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(profileStateProvider.notifier).changePassword(
        ChangePasswordRequest(
          currentPassword: _currentController.text,
          newPassword: _newController.text,
        ),
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.profilePasswordUpdated)),
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
