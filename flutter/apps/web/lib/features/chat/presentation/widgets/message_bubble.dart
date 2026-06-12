import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import '../../../e2ee/presentation/e2ee_glass_widgets.dart';
import 'file_bubble.dart';
import 'image_bubble.dart';
import 'video_bubble.dart';
import 'voice_bubble.dart';

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
    final maxWidth =
        (MediaQuery.of(context).size.width * 0.58).clamp(260, 560).toDouble();
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: maxWidth),
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 18),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          textDirection: isMe ? TextDirection.rtl : TextDirection.ltr,
          children: [
            _Avatar(
              avatar: message.senderAvatar,
              fallback: message.senderName ?? message.senderId,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: _BubbleWithArrow(
                isMe: isMe,
                color: _bubbleColor(context),
                child: _buildMessageContent(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(BuildContext context) {
    final theme = Theme.of(context);
    final decryptFailed =
        (message.decryptStatus ?? '').toLowerCase() == 'failed';
    final isE2ee = message.encrypted == true ||
        message.e2eeEnvelope != null ||
        (message.decryptStatus?.isNotEmpty ?? false);
    final isMedia = switch (message.messageType.toUpperCase()) {
      'IMAGE' || 'FILE' || 'VOICE' || 'VIDEO' => true,
      _ => false,
    };

    return Container(
      padding: isMedia
          ? const EdgeInsets.all(4)
          : const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (decryptFailed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 16,
                  color: Color(0xFFBA3247),
                ),
                const SizedBox(width: 6),
                Text(
                  '娑堟伅瑙ｅ瘑澶辫触',
                  style: TextStyle(
                    color: isMe ? Colors.black : const Color(0xFFBA3247),
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            )
          else
            switch (message.messageType.toUpperCase()) {
              'IMAGE' => ImageBubble(message: message, isMe: isMe),
              'FILE' => FileBubble(message: message, isMe: isMe),
              'VOICE' => VoiceBubble(message: message, isMe: isMe),
              'VIDEO' => VideoBubble(message: message, isMe: isMe),
              _ => Text(
                  message.content,
                  style: TextStyle(
                    color: theme.colorScheme.onSurface,
                    fontSize: 15,
                    height: 1.38,
                  ),
                ),
            },
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _formatTime(message.sendTime),
                style: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontSize: 11,
                ),
              ),
              if (isE2ee) ...[
                const SizedBox(width: 6),
                MessageBubbleE2eeBadge(isMe: isMe),
              ],
              if (isMe) ...[
                const SizedBox(width: 4),
                Icon(
                  _statusIcon(message.status),
                  size: 14,
                  color: message.status == 'READ'
                      ? ImTokens.wechatGreen
                      : theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Color _bubbleColor(BuildContext context) {
    final decryptFailed =
        (message.decryptStatus ?? '').toLowerCase() == 'failed';
    if (decryptFailed) {
      return isMe ? const Color(0xFFFFE8EC) : const Color(0xFFFFE8EC);
    }
    final brightness = Theme.of(context).brightness;
    if (brightness == Brightness.dark) {
      return isMe ? const Color(0xFF1F8F45) : const Color(0xFF2A2A2A);
    }
    return isMe ? ImTokens.wechatOwnBubble : ImTokens.wechatOtherBubble;
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'SENT':
        return Icons.check;
      case 'DELIVERED':
      case 'READ':
        return Icons.done_all;
      case 'SENDING':
        return Icons.access_time;
      default:
        return Icons.access_time;
    }
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

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.avatar,
    required this.fallback,
  });

  final String? avatar;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    final safeFallback = fallback.isEmpty ? '?' : fallback;
    return CircleAvatar(
      radius: 18,
      backgroundColor: const Color(0xFFD9D9D9),
      backgroundImage: avatar != null ? NetworkImage(avatar!) : null,
      child: avatar == null
          ? Text(
              safeFallback.substring(0, 1).toUpperCase(),
              style: const TextStyle(fontSize: 13, color: Color(0xFF4A4A4A)),
            )
          : null,
    );
  }
}

class _BubbleWithArrow extends StatelessWidget {
  const _BubbleWithArrow({
    required this.isMe,
    required this.color,
    required this.child,
  });

  final bool isMe;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final border = Border.all(color: Theme.of(context).dividerColor);
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      textDirection: isMe ? TextDirection.rtl : TextDirection.ltr,
      children: [
        _Arrow(color: color, isMe: isMe),
        Flexible(
          child: Container(
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
              border: isMe ? null : border,
            ),
            child: child,
          ),
        ),
      ],
    );
  }
}

class _Arrow extends StatelessWidget {
  const _Arrow({required this.color, required this.isMe});

  final Color color;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(7, 10),
      painter: _ArrowPainter(
        color: color,
        borderColor: isMe ? null : Theme.of(context).dividerColor,
        isMe: isMe,
      ),
    );
  }
}

class _ArrowPainter extends CustomPainter {
  const _ArrowPainter({
    required this.color,
    required this.isMe,
    this.borderColor,
  });

  final Color color;
  final Color? borderColor;
  final bool isMe;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    if (isMe) {
      path
        ..moveTo(0, 0)
        ..lineTo(size.width, 5)
        ..lineTo(0, 10)
        ..close();
    } else {
      path
        ..moveTo(size.width, 0)
        ..lineTo(0, 5)
        ..lineTo(size.width, 10)
        ..close();
    }
    canvas.drawPath(path, Paint()..color = color);
    if (borderColor != null) {
      canvas.drawPath(
        path,
        Paint()
          ..color = borderColor!
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ArrowPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.borderColor != borderColor ||
        oldDelegate.isMe != isMe;
  }
}
