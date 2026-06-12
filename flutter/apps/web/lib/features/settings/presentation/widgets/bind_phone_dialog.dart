import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';

class BindPhoneDialog extends ConsumerStatefulWidget {
  const BindPhoneDialog({super.key});

  @override
  ConsumerState<BindPhoneDialog> createState() => _BindPhoneDialogState();
}

class _BindPhoneDialogState extends ConsumerState<BindPhoneDialog> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  bool _loading = false;
  int _countdown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(loc.profilePhoneVerify),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _phoneController,
            decoration: InputDecoration(labelText: loc.profilePhone),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _codeController,
                  decoration: const InputDecoration(labelText: '验证码'),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: _countdown > 0 ? null : _sendCode,
                child: Text(_countdown > 0 ? '$_countdown s' : '发送验证码'),
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
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    try {
      await ref.read(profileStateProvider.notifier).sendPhoneCode(phone);
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
      await ref.read(profileStateProvider.notifier).bindPhone(
            BindPhoneRequest(
              phone: _phoneController.text.trim(),
              code: _codeController.text.trim(),
            ),
          );
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
