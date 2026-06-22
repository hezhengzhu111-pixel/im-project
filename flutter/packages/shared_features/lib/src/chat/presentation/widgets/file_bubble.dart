import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:url_launcher/url_launcher.dart';
import '../utils/file_size_formatter.dart';
import '../utils/file_type_icon.dart';

/// File message bubble.
///
/// Displays file name, size and type. Tapping the action button opens or
/// downloads the file via [url_launcher]. Failures are surfaced inline and
/// through a snackbar, and local file paths are never logged.
class FileBubble extends StatefulWidget {
  const FileBubble({required this.message, required this.isMe, super.key});

  final Message message;
  final bool isMe;

  @override
  State<FileBubble> createState() => _FileBubbleState();
}

class _FileBubbleState extends State<FileBubble> {
  bool _isOpening = false;

  Future<void> _openFile(BuildContext context) async {
    final loc = AppLocalizations.of(context)!;
    final url = widget.message.mediaUrl;
    if (url == null || url.isEmpty) {
      _showSnackBar(context, loc.chatReSelectFile);
      return;
    }

    setState(() => _isOpening = true);
    try {
      final uri = Uri.parse(url);
      final opened = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        _showSnackBar(context, loc.chatFileOpenUnsupported);
      }
    } catch (_) {
      if (mounted) _showSnackBar(context, loc.chatFileOpenFailed);
    } finally {
      if (mounted) setState(() => _isOpening = false);
    }
  }

  void _showSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final name = widget.message.mediaName ?? loc.chatFile;
    final icon = FileTypeIcon.iconFor(name);
    final label = FileTypeIcon.labelFor(name);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: widget.isMe
            ? Theme.of(context).colorScheme.primaryContainer
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Icon(
                icon,
                size: 40,
                color: Theme.of(context).colorScheme.primary,
              ),
              Positioned(
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 8,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (widget.message.mediaSize != null)
                  Text(
                    FileSizeFormatter.format(widget.message.mediaSize),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (_isOpening)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Tooltip(
              message: loc.chatFile,
              child: IconButton(
                icon: const Icon(Icons.open_in_browser),
                onPressed: () => _openFile(context),
              ),
            ),
        ],
      ),
    );
  }
}
