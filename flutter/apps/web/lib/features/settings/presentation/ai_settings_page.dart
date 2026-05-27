import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/settings/presentation/widgets/settings_section.dart';
import 'package:im_web/features/settings/presentation/widgets/api_key_card.dart';
import 'package:im_web/features/settings/presentation/widgets/add_api_key_form.dart';
import 'package:im_web/l10n/app_localizations.dart';

class AiSettingsPage extends ConsumerStatefulWidget {
  const AiSettingsPage({super.key});

  @override
  ConsumerState<AiSettingsPage> createState() => _AiSettingsPageState();
}

class _AiSettingsPageState extends ConsumerState<AiSettingsPage> {
  bool _showAddForm = false;
  final _personaController = TextEditingController();

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
    _personaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final aiState = ref.watch(aiSettingsStateProvider);
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Hero
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            children: [
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back_ios_new, size: 18),
              ),
              const SizedBox(width: 8),
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
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          loc.aiApiKeysDesc,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.tonalIcon(
                            onPressed: () => setState(
                                () => _showAddForm = !_showAddForm),
                            icon: Icon(
                                _showAddForm ? Icons.close : Icons.add),
                            label: Text(_showAddForm
                                ? loc.commonCancel
                                : loc.aiAddKey),
                          ),
                        ),
                      ),
                      if (_showAddForm) ...[
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16),
                          child: AddApiKeyForm(
                            onSubmit: (provider, key, label) async {
                              try {
                                await ref
                                    .read(aiSettingsStateProvider
                                        .notifier)
                                    .createKey(
                                  AiApiKeyCreateRequest(
                                    provider: provider,
                                    key: key,
                                    label:
                                        label.isEmpty ? null : label,
                                  ),
                                );
                                setState(
                                    () => _showAddForm = false);
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context)
                                      .showSnackBar(
                                    SnackBar(
                                        content: Text(e.toString())),
                                  );
                                }
                              }
                            },
                          ),
                        ),
                      ],
                      if (aiState.keys.isEmpty && !_showAddForm)
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Center(
                            child: Text(
                              loc.aiNoKeys,
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(
                                color: theme
                                    .colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ),
                      ...aiState.keys.map((key) => Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 4),
                            child: ApiKeyCard(
                              apiKey: key,
                              isTesting:
                                  aiState.testingKeyId == key.id,
                              onTest: () async {
                                try {
                                  await ref
                                      .read(aiSettingsStateProvider
                                          .notifier)
                                      .testKey(key.id);
                                } catch (e) {
                                  if (mounted) {
                                    ScaffoldMessenger.of(context)
                                        .showSnackBar(
                                      SnackBar(
                                          content:
                                              Text(e.toString())),
                                    );
                                  }
                                }
                              },
                              onDelete: () async {
                                final confirm =
                                    await showDialog<bool>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                    title: Text(loc.aiDeleteKey),
                                    content: Text(
                                        loc.aiDeleteConfirm),
                                    actions: [
                                      TextButton(
                                          onPressed: () =>
                                              Navigator.pop(
                                                  ctx, false),
                                          child: Text(
                                              loc.commonCancel)),
                                      FilledButton(
                                          onPressed: () =>
                                              Navigator.pop(
                                                  ctx, true),
                                          child: Text(
                                              loc.commonConfirm)),
                                    ],
                                  ),
                                );
                                if (confirm == true) {
                                  await ref
                                      .read(aiSettingsStateProvider
                                          .notifier)
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

            const SizedBox(width: 16),
            // Secondary - Auto reply
            SizedBox(
              width: 340,
              child: SettingsSection(
                children: [
                  SwitchListTile(
                    title: Text(loc.aiAutoReplyEnabled),
                    subtitle: Text(loc.aiAutoReplyDesc,
                        style: const TextStyle(fontSize: 12)),
                    value: aiState.aiSettings?.autoReplyEnabled ??
                        false,
                    onChanged: (v) {
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
                  if (aiState.aiSettings?.autoReplyEnabled ==
                      true) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                          16, 0, 16, 16),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(loc.aiAutoReplyPersona,
                              style: theme.textTheme.titleSmall),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _personaController
                              ..text = aiState.aiSettings
                                      ?.autoReplyPersona ??
                                  '',
                            decoration: InputDecoration(
                              hintText:
                                  loc.aiAutoReplyPersonaPlaceholder,
                              border:
                                  const OutlineInputBorder(),
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
    Future.delayed(const Duration(milliseconds: 500), () {
      if (_personaController.text == value && mounted) {
        final current =
            ref.read(aiSettingsStateProvider).aiSettings;
        ref
            .read(aiSettingsStateProvider.notifier)
            .updateAiSettings(
          AiSettings(
            autoReplyEnabled:
                current?.autoReplyEnabled ?? false,
            autoReplyPersona: value,
          ),
        );
      }
    });
  }
}
