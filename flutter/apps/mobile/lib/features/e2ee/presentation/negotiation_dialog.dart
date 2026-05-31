import 'package:flutter/material.dart';
import '../../../l10n/app_localizations.dart';

class NegotiationDialog extends StatefulWidget {
  const NegotiationDialog({
    required this.requesterName,
    required this.onAccept,
    required this.onReject,
    super.key,
  });

  final String requesterName;
  final Future<void> Function() onAccept;
  final Future<void> Function() onReject;

  @override
  State<NegotiationDialog> createState() => _NegotiationDialogState();
}

class _NegotiationDialogState extends State<NegotiationDialog> {
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _handleAccept() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await widget.onAccept();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleReject() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await widget.onReject();
      if (mounted) Navigator.of(context).pop(false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.lock, color: Colors.green),
          const SizedBox(width: 8),
          Text(loc.e2eeRequestTitle),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(loc.e2eeRequestDescription(widget.requesterName)),
          const SizedBox(height: 12),
          Text(
            loc.e2eeSignalProtocol,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(loc.e2eeSignalBullet1),
          Text(loc.e2eeSignalBullet2),
          Text(loc.e2eeSignalBullet3),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : _handleReject,
          child: Text(loc.e2eeReject),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleAccept,
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(loc.e2eeAccept),
        ),
      ],
    );
  }
}
