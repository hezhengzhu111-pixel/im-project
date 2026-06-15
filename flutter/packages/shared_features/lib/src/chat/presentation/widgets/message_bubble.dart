import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class MessageBubble extends ConsumerWidget {
  final Message message;
  final bool isMe;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isMe,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final senderName = message.senderName ?? message.senderId;
    final initial =
        senderName.isNotEmpty ? senderName.substring(0, 1).toUpperCase() : '?';

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
                child: message.senderAvatar == null ? Text(initial) : null,
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
                      color: Colors.black.withAlpha(20),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildContent(context, ref, theme),
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
                child: message.senderAvatar == null ? Text(initial) : null,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, ThemeData theme) {
    switch (message.messageType) {
      case 'TEXT':
        return Text(
          message.content,
          style: TextStyle(
            color: isMe
                ? theme.colorScheme.onPrimary
                : theme.colorScheme.onSurface,
            fontSize: 15,
          ),
        );
      case 'IMAGE':
        return _buildImageContent(context, theme);
      case 'FILE':
        return _buildFileContent(theme);
      case 'VOICE':
        return _buildVoiceContent(theme);
      case 'VIDEO':
        return _buildVideoContent(context, theme);
      default:
        return Text(
          message.content,
          style: TextStyle(
            color: isMe
                ? theme.colorScheme.onPrimary
                : theme.colorScheme.onSurface,
            fontSize: 15,
          ),
        );
    }
  }

  Widget _buildImageContent(BuildContext context, ThemeData theme) {
    final url = message.mediaUrl ?? message.thumbnailUrl;
    if (url == null || url.isEmpty) {
      return const Text('[图片]');
    }

    // P0 止血：图片查看器尚未实现，暂以静态展示。
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
          url,
          width: 200,
          height: 150,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              width: 200,
              height: 150,
              color: Colors.grey[300],
              child: const Icon(Icons.image_not_supported),
            );
          },
        ),
    );
  }

  Widget _buildFileContent(ThemeData theme) {
    final fileName = message.mediaName ?? '文件';
    final fileSize = message.mediaSize;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.attach_file,
          color: isMe ? theme.colorScheme.onPrimary : theme.colorScheme.primary,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                fileName,
                style: TextStyle(
                  color: isMe
                      ? theme.colorScheme.onPrimary
                      : theme.colorScheme.onSurface,
                  fontWeight: FontWeight.bold,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              if (fileSize != null)
                Text(
                  _formatFileSize(fileSize),
                  style: TextStyle(
                    color: isMe
                        ? theme.colorScheme.onPrimary.withAlpha(180)
                        : theme.colorScheme.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildVoiceContent(ThemeData theme) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.mic,
          color: isMe ? theme.colorScheme.onPrimary : theme.colorScheme.primary,
        ),
        const SizedBox(width: 8),
        Text(
          '语音消息',
          style: TextStyle(
            color: isMe
                ? theme.colorScheme.onPrimary
                : theme.colorScheme.onSurface,
          ),
        ),
      ],
    );
  }

  Widget _buildVideoContent(BuildContext context, ThemeData theme) {
    final url = message.mediaUrl;
    if (url == null || url.isEmpty) {
      return const Text('[视频]');
    }

    // P0 止血：视频播放器尚未实现，暂以静态展示。
    return Container(
        width: 200,
        height: 150,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Icon(
            Icons.play_circle_outline,
            color: Colors.white,
            size: 48,
          ),
        ),
    );
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  bool _isMedia(String type) {
    return switch (type.toUpperCase()) {
      'IMAGE' || 'FILE' || 'VOICE' || 'VIDEO' => true,
      _ => false,
    };
  }

  Color _bubbleColor(ThemeData theme) {
    return isMe
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHighest;
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
