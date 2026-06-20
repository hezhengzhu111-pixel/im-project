import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import '../presentation/settings_providers.dart';
import 'widgets/add_api_key_form.dart';
import 'widgets/api_key_card.dart';
import 'widgets/settings_section.dart';

class AiSettingsPage extends ConsumerStatefulWidget {
  const AiSettingsPage({super.key});

  @override
  ConsumerState<AiSettingsPage> createState() => _AiSettingsPageState();
}

class _AiSettingsPageState extends ConsumerState<AiSettingsPage> {
  bool _showAddForm = false;
  final _personaController = TextEditingController();
  Timer? _personaDebounce;
  bool _personaHydrated = false;

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
    _personaDebounce?.cancel();
    _personaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final aiState = ref.watch(aiSettingsStateProvider);
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final loadedPersona = aiState.aiSettings?.autoReplyPersona;
    if (!_personaHydrated && loadedPersona != null) {
      _personaHydrated = true;
      if (_personaController.text.isEmpty) {
        _personaController.text = loadedPersona;
      }
    }

    return ListView(
      padding: const EdgeInsets.all(ImTokens.space4),
      children: [
        // Hero
        Padding(
          padding: const EdgeInsets.only(bottom: ImTokens.space3),
          child: Row(
            children: [
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back_ios_new, size: 18),
              ),
              const SizedBox(width: ImTokens.space2),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    loc.aiTitle,
                    style: theme.textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (aiState.loading || aiState.savingSettings) ...[
          const LinearProgressIndicator(minHeight: 2),
          const SizedBox(height: ImTokens.space3),
        ],
        if (aiState.errorMessage != null) ...[
          _AiStatusBanner(
            message: aiState.errorMessage!,
            isError: true,
          ),
          const SizedBox(height: ImTokens.space3),
        ] else if (aiState.successMessage != null) ...[
          _AiStatusBanner(message: aiState.successMessage!),
          const SizedBox(height: ImTokens.space3),
        ],

        // Two-column layout
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Primary - API Key management
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SettingsSection(
                    title: loc.aiApiKeys,
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(ImTokens.space4),
                        child: Text(
                          loc.aiApiKeysDesc,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.tonalIcon(
                            onPressed: aiState.creatingKey
                                ? null
                                : () => setState(
                                      () => _showAddForm = !_showAddForm,
                                    ),
                            icon: Icon(_showAddForm ? Icons.close : Icons.add),
                            label: Text(
                                _showAddForm ? loc.commonCancel : loc.aiAddKey),
                          ),
                        ),
                      ),
                      if (_showAddForm) ...[
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: AddApiKeyForm(
                            onSubmit: (provider, key, label) async {
                              final saved = await ref
                                  .read(aiSettingsStateProvider.notifier)
                                  .createKey(
                                    AiApiKeyCreateRequest(
                                      provider: provider,
                                      key: key,
                                      label: label.isEmpty ? null : label,
                                    ),
                                  );
                              if (saved && mounted) {
                                setState(() => _showAddForm = false);
                              }
                              return saved;
                            },
                          ),
                        ),
                      ],
                      if (aiState.loading && aiState.keys.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(ImTokens.space4),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (aiState.keys.isEmpty && !_showAddForm)
                        Padding(
                          padding: const EdgeInsets.all(ImTokens.space4),
                          child: Center(
                            child: Text(
                              loc.aiNoKeys,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ),
                      ...aiState.keys.map((key) => Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 4),
                            child: ApiKeyCard(
                              apiKey: key,
                              isTesting: aiState.testingKeyId == key.id,
                              onTest: () async {
                                await ref
                                    .read(aiSettingsStateProvider.notifier)
                                    .testKey(key.id);
                              },
                              onDelete: () async {
                                final confirm = await showDialog<bool>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                    title: Text(loc.aiDeleteKey),
                                    content: Text(loc.aiDeleteConfirm),
                                    actions: [
                                      TextButton(
                                          onPressed: () =>
                                              Navigator.pop(ctx, false),
                                          child: Text(loc.commonCancel)),
                                      FilledButton(
                                          onPressed: () =>
                                              Navigator.pop(ctx, true),
                                          child: Text(loc.commonConfirm)),
                                    ],
                                  ),
                                );
                                if (confirm == true) {
                                  await ref
                                      .read(aiSettingsStateProvider.notifier)
                                      .deleteKey(key.id);
                                }
                              },
                            ),
                          )),
                      const SizedBox(height: 16),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(width: ImTokens.space4),
            // Secondary - Auto reply
            SizedBox(
              width: 340,
              child: SettingsSection(
                children: [
                  Material(
                    color: Colors.transparent,
                    child: SwitchListTile(
                      title: Text(loc.aiAutoReplyEnabled),
                      subtitle: Text(loc.aiAutoReplyDesc,
                          style: const TextStyle(fontSize: 12)),
                      value: aiState.aiSettings?.autoReplyEnabled ?? false,
                      onChanged: aiState.savingSettings
                          ? null
                          : (v) {
                              final current = aiState.aiSettings;
                              ref
                                  .read(aiSettingsStateProvider.notifier)
                                  .updateAiSettings(
                                    AiSettings(
                                      autoReplyEnabled: v,
                                      autoReplyPersona:
                                          current?.autoReplyPersona ?? '',
                                    ),
                                  );
                            },
                    ),
                  ),
                  if (aiState.aiSettings?.autoReplyEnabled == true) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(loc.aiAutoReplyPersona,
                              style: theme.textTheme.titleSmall),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _personaController,
                            enabled: !aiState.savingSettings,
                            decoration: InputDecoration(
                              hintText: loc.aiAutoReplyPersonaPlaceholder,
                              border: const OutlineInputBorder(),
                            ),
                            maxLines: 5,
                            onChanged: _onPersonaChanged,
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _onPersonaChanged(String value) {
    _personaDebounce?.cancel();
    _personaDebounce = Timer(const Duration(milliseconds: 500), () {
      if (_personaController.text == value && mounted) {
        final current = ref.read(aiSettingsStateProvider).aiSettings;
        ref.read(aiSettingsStateProvider.notifier).updateAiSettings(
              AiSettings(
                autoReplyEnabled: current?.autoReplyEnabled ?? false,
                autoReplyPersona: value,
              ),
            );
      }
    });
  }
}

class _AiStatusBanner extends StatelessWidget {
  const _AiStatusBanner({
    required this.message,
    this.isError = false,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isError ? theme.colorScheme.error : theme.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        children: [
          Icon(
            isError ? Icons.error_outline : Icons.check_circle_outline,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}
