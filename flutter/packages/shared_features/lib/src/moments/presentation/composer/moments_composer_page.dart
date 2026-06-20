import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import '../moments_providers.dart';
import 'composer_provider.dart';
import 'widgets/media_upload_grid.dart';
import 'widgets/visibility_picker.dart';

class MomentsComposerPage extends ConsumerStatefulWidget {
  const MomentsComposerPage({super.key});

  @override
  ConsumerState<MomentsComposerPage> createState() =>
      _MomentsComposerPageState();
}

class _MomentsComposerPageState extends ConsumerState<MomentsComposerPage> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final composer = ref.watch(composerProvider);
    final theme = Theme.of(context);
    final user = ref.watch(authStateProvider).user;
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.momentsPublishTitle),
        centerTitle: true,
        actions: [
          TextButton(
            onPressed: composer.canPublish && !composer.isPublishing
                ? _handlePublish
                : null,
            child: composer.isPublishing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.momentsPublishButton),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Author
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundImage:
                    user?.avatar != null ? NetworkImage(user!.avatar!) : null,
                child: user?.avatar == null
                    ? Text(
                        (user?.nickname ?? 'U').substring(0, 1).toUpperCase())
                    : null,
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user?.nickname ??
                        user?.username ??
                        l10n.momentsUserFallback,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  Row(
                    children: [
                      Icon(composer.visibility.icon,
                          size: 14, color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(
                        visibilityLabel(context, composer.visibility),
                        style: TextStyle(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Content input
          TextField(
            controller: _controller,
            maxLines: null,
            minLines: 4,
            maxLength: 1000,
            decoration: InputDecoration(
              hintText: l10n.momentsShareHint,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              filled: true,
              fillColor: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.5),
              counterStyle: TextStyle(
                  fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
            ),
            onChanged: (value) {
              ref.read(composerProvider.notifier).setContent(value);
            },
          ),

          const SizedBox(height: 16),

          // Media upload
          MediaUploadGrid(
            files: composer.files
                .map((f) => MediaUploadItem(
                      bytes: f.bytes,
                      fileName: f.fileName,
                      isVideo: f.isVideo,
                    ))
                .toList(),
            onAdd: (item) {
              ref.read(composerProvider.notifier).addFile(ComposerFile(
                    bytes: item.bytes,
                    fileName: item.fileName,
                    isVideo: item.isVideo,
                  ));
            },
            onRemove: (index) {
              ref.read(composerProvider.notifier).removeFile(index);
            },
          ),

          const SizedBox(height: 16),

          // Visibility
          Row(
            children: [
              Text(
                l10n.momentsVisibility,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: VisibilityPicker(
                  value: composer.visibility,
                  onChanged: (v) {
                    ref.read(composerProvider.notifier).setVisibility(v);
                  },
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Location
          Row(
            children: [
              Icon(Icons.location_on_outlined,
                  size: 20, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: l10n.momentsLocationHint,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    fillColor: theme.colorScheme.surfaceContainerHighest
                        .withValues(alpha: 0.3),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    isDense: true,
                  ),
                  onChanged: (value) {
                    ref.read(composerProvider.notifier).setLocation(value);
                  },
                ),
              ),
            ],
          ),

          // Error display
          if (composer.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                composer.error!,
                style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _handlePublish() async {
    final successMessage = AppLocalizations.of(context)!.momentsPublishSuccess;
    final success = await ref.read(composerProvider.notifier).publish();
    if (!success || !mounted) return;

    // Close the dialog first while context is still valid,
    // then show snackbar and refresh feed on the parent page.
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();

    // Refresh feed on the parent moments page.
    ref.read(momentsFeedProvider.notifier).loadFeed(refresh: true);

    // Show success snackbar on the parent scaffold (after dialog is closed).
    messenger.showSnackBar(
      SnackBar(content: Text(successMessage)),
    );
  }
}
