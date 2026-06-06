import 'package:flutter/material.dart';

class NegotiationDialog extends StatefulWidget {
  const NegotiationDialog({
    required this.requesterName,
    required this.title,
    required this.descriptionBuilder,
    required this.signalProtocolLabel,
    required this.signalBullet1,
    required this.signalBullet2,
    required this.signalBullet3,
    required this.rejectLabel,
    required this.acceptLabel,
    required this.onAccept,
    required this.onReject,
    super.key,
  });

  final String requesterName;
  final String title;
  final String Function(String requesterName) descriptionBuilder;
  final String signalProtocolLabel;
  final String signalBullet1;
  final String signalBullet2;
  final String signalBullet3;
  final String rejectLabel;
  final String acceptLabel;
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
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.lock, color: Colors.green),
          const SizedBox(width: 8),
          Text(widget.title),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.descriptionBuilder(widget.requesterName)),
          const SizedBox(height: 12),
          Text(
            widget.signalProtocolLabel,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(widget.signalBullet1),
          Text(widget.signalBullet2),
          Text(widget.signalBullet3),
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
          child: Text(widget.rejectLabel),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleAccept,
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(widget.acceptLabel),
        ),
      ],
    );
  }
}
