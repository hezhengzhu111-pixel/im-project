import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    required this.message,
    required this.isMe,
    super.key,
  });

  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.55,
        ),
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isMe) ...[
              CircleAvatar(
                radius: 16,
                backgroundImage: message.senderAvatar != null
                    ? NetworkImage(message.senderAvatar!)
                    : null,
                child: message.senderAvatar == null
                    ? Text(
                        (message.senderName ?? message.senderId)
                            .substring(0, 1)
                            .toUpperCase(),
                        style: const TextStyle(fontSize: 12),
                      )
                    : null,
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Container(
                padding: _isMedia(message.messageType)
                    ? const EdgeInsets.all(4)
                    : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: _bubbleColor(theme),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(isMe ? 18 : 6),
                    bottomRight: Radius.circular(isMe ? 6 : 18),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildContent(theme),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _formatTime(message.sendTime),
                          style: TextStyle(
                            color: isMe
                                ? theme.colorScheme.onPrimary.withAlpha(170)
                                : theme.colorScheme.onSurfaceVariant,
                            fontSize: 11,
                          ),
                        ),
                        if (isMe) ...[
                          const SizedBox(width: 4),
                          Icon(
                            _statusIcon(message.status),
                            size: 14,
                            color: message.status == 'READ'
                                ? Colors.blue
                                : theme.colorScheme.onPrimary.withAlpha(170),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (isMe) ...[
              const SizedBox(width: 8),
              CircleAvatar(
                radius: 16,
                backgroundImage: message.senderAvatar != null
                    ? NetworkImage(message.senderAvatar!)
                    : null,
                child: message.senderAvatar == null
                    ? Text(
                        (message.senderName ?? message.senderId)
                            .substring(0, 1)
                            .toUpperCase(),
                        style: const TextStyle(fontSize: 12),
                      )
                    : null,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildContent(ThemeData theme) {
    return Text(
      message.content,
      style: TextStyle(
        color: isMe ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
        fontSize: 15,
      ),
    );
  }

  bool _isMedia(String type) {
    return switch (type.toUpperCase()) {
      'IMAGE' || 'FILE' || 'VOICE' || 'VIDEO' => true,
      _ => false,
    };
  }

  Color _bubbleColor(ThemeData theme) {
    return isMe ? theme.colorScheme.primary : theme.colorScheme.surfaceContainerHighest;
  }

  IconData _statusIcon(String status) {
    return switch (status) {
      'SENT' => Icons.check,
      'DELIVERED' => Icons.done_all,
      'READ' => Icons.done_all,
      'SENDING' => Icons.access_time,
      _ => Icons.access_time,
    };
  }

  String _formatTime(String time) {
    try {
      final dt = DateTime.parse(time);
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return time;
    }
  }
}
