import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class VoiceBubble extends StatefulWidget {
  const VoiceBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  State<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<VoiceBubble> {
  bool _isPlaying = false;

  @override
  Widget build(BuildContext context) {
    final duration = widget.message.duration ?? 0;
    return GestureDetector(
      onTap: () {
        setState(() => _isPlaying = !_isPlaying);
        // TODO: implement actual audio playback
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: widget.isMe
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _isPlaying ? Icons.pause : Icons.play_arrow,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            ...List.generate(
              (duration / 100).clamp(3, 20).toInt(),
              (i) => Container(
                width: 3,
                height: (8 + (i % 3) * 4).toDouble(),
                margin: const EdgeInsets.symmetric(horizontal: 1),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withAlpha(150),
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${(duration / 1000).toStringAsFixed(1)}s',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
