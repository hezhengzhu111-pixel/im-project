import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../presentation/settings_providers.dart';

class AiSettingsPage extends ConsumerStatefulWidget {
  const AiSettingsPage({super.key});

  @override
  ConsumerState<AiSettingsPage> createState() => _AiSettingsPageState();
}

class _AiSettingsPageState extends ConsumerState<AiSettingsPage> {
  bool _showAddForm = false;
  final _addProviderController = TextEditingController(text: 'openai');
  final _addKeyController = TextEditingController();
  final _addLabelController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(aiSettingsStateProvider.notifier).loadKeys();
      ref.read(aiSettingsStateProvider.notifier).loadAiSettings();
    });
  }

  @override
  void dispose() {
    _addProviderController.dispose();
    _addKeyController.dispose();
    _addLabelController.dispose();
    super.dispose();
  }

  String _maskKey(String key) {
    if (key.length <= 8) return '****';
    return '${key.substring(0, 4)}****${key.substring(key.length - 4)}';
  }

  Future<void> _createKey() async {
    if (!_formKey.currentState!.validate()) return;
    try {
      await ref.read(aiSettingsStateProvider.notifier).createKey(
            AiApiKeyCreateRequest(
              provider: _addProviderController.text.trim(),
              key: _addKeyController.text.trim(),
              label: _addLabelController.text.trim().isEmpty
                  ? null
                  : _addLabelController.text.trim(),
            ),
          );
      if (mounted) {
        setState(() => _showAddForm = false);
        _addKeyController.clear();
        _addLabelController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.keyCreated)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.keyCreateFailed)),
        );
      }
    }
  }

  Future<void> _deleteKey(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(_Strings.deleteKeyTitle),
        content: const Text(_Strings.deleteKeyConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(_Strings.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(_Strings.confirm),
          ),
        ],
      ),
    );
    if (confirm == true) {
      try {
        await ref.read(aiSettingsStateProvider.notifier).deleteKey(id);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text(_Strings.keyDeleteFailed)),
          );
        }
      }
    }
  }

  Future<void> _testKey(String id) async {
    try {
      await ref.read(aiSettingsStateProvider.notifier).testKey(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.keyTestSuccess)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.keyTestFailed)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final aiState = ref.watch(aiSettingsStateProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text(_Strings.title),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // API Keys section
          Text(_Strings.apiKeysSection, style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            _Strings.apiKeysDesc,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),

          // Add key button
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _showAddForm = !_showAddForm),
              icon: Icon(_showAddForm ? Icons.close : Icons.add),
              label: Text(_showAddForm ? _Strings.cancel : _Strings.addKey),
            ),
          ),

          // Add key form
          if (_showAddForm) ...[
            const SizedBox(height: 8),
            Form(
              key: _formKey,
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _addProviderController.text,
                        decoration: const InputDecoration(
                          labelText: _Strings.providerLabel,
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                              value: 'openai', child: Text('OpenAI')),
                          DropdownMenuItem(
                              value: 'deepseek', child: Text('DeepSeek')),
                          DropdownMenuItem(
                              value: 'minimax', child: Text('MiniMax')),
                        ],
                        onChanged: (v) {
                          if (v != null) _addProviderController.text = v;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _addKeyController,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: _Strings.keyLabel,
                          border: OutlineInputBorder(),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return _Strings.keyRequired;
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _addLabelController,
                        decoration: const InputDecoration(
                          labelText: _Strings.labelLabel,
                          hintText: _Strings.labelHint,
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 40,
                        child: ElevatedButton(
                          onPressed: _createKey,
                          child: const Text(_Strings.saveKey),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],

          const SizedBox(height: 16),

          // Keys list
          if (aiState.loading && aiState.keys.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            )
          else if (aiState.keys.isEmpty && !_showAddForm)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(
                  _Strings.noKeys,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            ...aiState.keys.map(
              (apiKey) => Card(
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ListTile(
                  leading: Icon(
                    Icons.key,
                    color: _statusColor(apiKey.status, theme),
                  ),
                  title: Text(apiKey.label ?? apiKey.provider),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _maskKey(apiKey.key),
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontFamily: 'monospace',
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${_Strings.statusLabel}${apiKey.status}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: _statusColor(apiKey.status, theme),
                        ),
                      ),
                    ],
                  ),
                  isThreeLine: true,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (aiState.testingKeyId == apiKey.id)
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        IconButton(
                          icon: const Icon(Icons.wifi_tethering, size: 20),
                          tooltip: _Strings.testKey,
                          onPressed: () => _testKey(apiKey.id),
                        ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        tooltip: _Strings.deleteKey,
                        onPressed: () => _deleteKey(apiKey.id),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          const Divider(height: 32),

          // AI Settings section
          Text(_Strings.settingsSection, style: theme.textTheme.titleMedium),
          const SizedBox(height: 12),

          SwitchListTile(
            title: const Text(_Strings.autoReplyEnabled),
            subtitle: const Text(_Strings.autoReplyDesc),
            value: aiState.aiSettings?.autoReplyEnabled ?? false,
            onChanged: (v) {
              final current = aiState.aiSettings;
              ref.read(aiSettingsStateProvider.notifier).updateAiSettings(
                    AiSettings(
                      autoReplyEnabled: v,
                      autoReplyPersona: current?.autoReplyPersona ?? '',
                    ),
                  );
            },
          ),

          if (aiState.aiSettings?.autoReplyEnabled == true)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(_Strings.personaLabel),
                  const SizedBox(height: 8),
                  TextField(
                    controller: TextEditingController(
                      text: aiState.aiSettings?.autoReplyPersona ?? '',
                    ),
                    decoration: const InputDecoration(
                      hintText: _Strings.personaHint,
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 3,
                    onSubmitted: (value) {
                      final current = aiState.aiSettings;
                      ref
                          .read(aiSettingsStateProvider.notifier)
                          .updateAiSettings(
                            AiSettings(
                              autoReplyEnabled:
                                  current?.autoReplyEnabled ?? false,
                              autoReplyPersona: value,
                            ),
                          );
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Color _statusColor(String status, ThemeData theme) {
    switch (status.toLowerCase()) {
      case 'valid':
      case 'active':
        return Colors.green;
      case 'invalid':
      case 'expired':
        return theme.colorScheme.error;
      default:
        return theme.colorScheme.onSurfaceVariant;
    }
  }
}

class _Strings {
  _Strings._();
  static const title = 'AI Settings';
  static const apiKeysSection = 'API Keys';
  static const apiKeysDesc = 'Manage your AI provider API keys';
  static const addKey = 'Add Key';
  static const cancel = 'Cancel';
  static const providerLabel = 'Provider';
  static const keyLabel = 'API Key';
  static const keyRequired = 'API key is required';
  static const labelLabel = 'Label (optional)';
  static const labelHint = 'e.g. My OpenAI Key';
  static const saveKey = 'Save Key';
  static const noKeys = 'No API keys configured';
  static const statusLabel = 'Status: ';
  static const testKey = 'Test connection';
  static const deleteKey = 'Delete';
  static const deleteKeyTitle = 'Delete API Key';
  static const deleteKeyConfirm = 'Are you sure you want to delete this key?';
  static const confirm = 'Confirm';
  static const keyCreated = 'API key added successfully';
  static const keyCreateFailed = 'Failed to add API key';
  static const keyDeleteFailed = 'Failed to delete API key';
  static const keyTestSuccess = 'Key test completed';
  static const keyTestFailed = 'Key test failed';
  static const settingsSection = 'AI Settings';
  static const autoReplyEnabled = 'Auto Reply';
  static const autoReplyDesc = 'Enable AI-powered auto reply';
  static const personaLabel = 'AI Persona';
  static const personaHint = 'Describe how the AI should respond...';
}
