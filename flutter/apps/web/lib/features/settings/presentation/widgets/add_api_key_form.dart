import 'package:flutter/material.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/l10n/app_localizations.dart';

class AddApiKeyForm extends StatefulWidget {
  const AddApiKeyForm({required this.onSubmit, super.key});

  final void Function(String provider, String key, String label) onSubmit;

  @override
  State<AddApiKeyForm> createState() => _AddApiKeyFormState();
}

class _AddApiKeyFormState extends State<AddApiKeyForm> {
  String _provider = 'DeepSeek';
  final _keyController = TextEditingController();
  final _labelController = TextEditingController();

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

    final glass = theme.extension<GlassTheme>()!;

    return Container(
      decoration: BoxDecoration(
        color: glass.cardBackground,
        borderRadius: BorderRadius.circular(glass.controlRadius),
        border: Border.all(color: glass.cardBorder),
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
              value: _provider,
              decoration: InputDecoration(labelText: loc.aiProvider),
              items: const [
                DropdownMenuItem(
                    value: 'DeepSeek', child: Text('DeepSeek')),
                DropdownMenuItem(
                    value: 'MiniMax', child: Text('MiniMax')),
                DropdownMenuItem(
                    value: 'OpenAI', child: Text('OpenAI')),
              ],
              onChanged: (v) =>
                  setState(() => _provider = v ?? 'DeepSeek'),
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
                onPressed: _submit,
                child: Text(loc.aiSave),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    if (_keyController.text.trim().isEmpty) return;
    widget.onSubmit(
      _provider,
      _keyController.text.trim(),
      _labelController.text.trim(),
    );
    _keyController.clear();
    _labelController.clear();
  }
}
