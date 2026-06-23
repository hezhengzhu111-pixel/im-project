import 'dart:async';

import 'package:flutter/material.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';

class AddApiKeyForm extends StatefulWidget {
  const AddApiKeyForm({required this.onSubmit, super.key});

  final FutureOr<bool> Function(String provider, String key, String label)
      onSubmit;

  @override
  State<AddApiKeyForm> createState() => _AddApiKeyFormState();
}

class _AddApiKeyFormState extends State<AddApiKeyForm> {
  String _provider = 'DeepSeek';
  final _keyController = TextEditingController();
  final _labelController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _keyController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>();

    return Container(
      decoration: BoxDecoration(
        color: glass?.cardBackground ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(glass?.controlRadius ?? 12),
        border: Border.all(
            color: glass?.cardBorder ?? theme.colorScheme.outlineVariant),
      ),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(loc.aiAddKey,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              // ignore: deprecated_member_use
              value: _provider,
              decoration: InputDecoration(labelText: loc.aiProvider),
              items: const [
                DropdownMenuItem(value: 'DeepSeek', child: Text('DeepSeek')),
                DropdownMenuItem(value: 'MiniMax', child: Text('MiniMax')),
                DropdownMenuItem(value: 'OpenAI', child: Text('OpenAI')),
              ],
              onChanged: (v) => setState(() => _provider = v ?? 'DeepSeek'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _keyController,
              decoration: InputDecoration(labelText: loc.aiApiKeyInput),
              obscureText: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _labelController,
              decoration: InputDecoration(
                labelText: loc.aiKeyName,
                hintText: loc.aiKeyNamePlaceholder,
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(loc.aiSave),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_keyController.text.trim().isEmpty) return;
    setState(() => _isSubmitting = true);
    try {
      final saved = await Future.sync(
        () => widget.onSubmit(
          _provider,
          _keyController.text.trim(),
          _labelController.text.trim(),
        ),
      );
      if (saved) {
        _keyController.clear();
        _labelController.clear();
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
