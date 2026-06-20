import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import '../settings_providers.dart';

class BindEmailDialog extends ConsumerStatefulWidget {
  const BindEmailDialog({super.key});

  @override
  ConsumerState<BindEmailDialog> createState() => _BindEmailDialogState();
}

class _BindEmailDialogState extends ConsumerState<BindEmailDialog> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  bool _loading = false;
  int _countdown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(loc.profileEmailVerify),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _emailController,
            decoration: InputDecoration(labelText: loc.profileEmail),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _codeController,
                  decoration: InputDecoration(labelText: loc.verificationCode),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: _countdown > 0 ? null : _sendCode,
                child: Text(_countdown > 0 ? '$_countdown s' : loc.sendVerificationCode),
              ),
            ],
          ),
        ],
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

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;
    try {
      await ref.read(profileStateProvider.notifier).sendEmailCode(email);
      _startCountdown();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  void _startCountdown() {
    _countdown = 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _countdown--;
        if (_countdown <= 0) timer.cancel();
      });
    });
  }

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      await ref.read(profileStateProvider.notifier).bindEmail(
            BindEmailRequest(
              email: _emailController.text.trim(),
              code: _codeController.text.trim(),
            ),
          );
      final updatedUser = ref.read(profileStateProvider).user;
      if (updatedUser != null) {
        ref.read(authStateProvider.notifier).updateUser(updatedUser);
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}
