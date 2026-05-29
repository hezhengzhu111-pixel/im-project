import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import '../../../e2ee/presentation/e2ee_glass_widgets.dart';
import 'image_bubble.dart';
import 'file_bubble.dart';
import 'voice_bubble.dart';
import 'video_bubble.dart';

class MessageBubble extends StatefulWidget {
  const MessageBubble({
    required this.message,
    required this.isMe,
    super.key,
  });

  final Message message;
  final bool isMe;

  @override
  State<MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<MessageBubble> {
  bool _hovered = false;

  Message get message => widget.message;
  bool get isMe => widget.isMe;

  @override
  Widget build(BuildContext context) {
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
              child: MouseRegion(
                onEnter: (_) => setState(() => _hovered = true),
                onExit: (_) => setState(() => _hovered = false),
                child: AnimatedContainer(
                  duration: ImTokens.animNormal,
                  curve: Curves.easeOut,
                  transform: Matrix4.translationValues(0, _hovered ? -3 : 0, 0),
                  child: _BubbleWithArrow(
                    isMe: isMe,
                    color: _bubbleColor(context),
                    shadow: [
                      BoxShadow(
                        color: const Color(0xFF191C40)
                            .withValues(alpha: _hovered ? 0.18 : 0.08),
                        blurRadius: _hovered ? 28 : 14,
                        offset: Offset(0, _hovered ? 14 : 6),
                      ),
                    ],
                    child: _buildMessageContent(context),
                  ),
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
          : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: isMedia ? null : const BoxDecoration(),
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
                  '消息解密失败',
                  style: TextStyle(
                    color: isMe ? Colors.white : const Color(0xFFBA3247),
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
                    color: isMe
                        ? theme.colorScheme.onPrimary
                        : theme.colorScheme.onSurface,
                    fontSize: 15,
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
                  color: isMe
                      ? theme.colorScheme.onPrimary.withAlpha(170)
                      : theme.colorScheme.onSurfaceVariant,
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
                      ? Colors.blue
                      : theme.colorScheme.onPrimary.withAlpha(170),
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
      return isMe
          ? const Color(0xFFBA3247)
          : const Color(0xFFFFE8EC).withValues(alpha: 0.92);
    }
    return isMe ? imGlassBrand : Colors.white.withValues(alpha: 0.68);
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'SENT':
        return Icons.check;
      case 'DELIVERED':
        return Icons.done_all;
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

class _BubbleWithArrow extends StatelessWidget {
  const _BubbleWithArrow({
    required this.isMe,
    required this.color,
    required this.child,
    required this.shadow,
  });

  final bool isMe;
  final Color color;
  final Widget child;
  final List<BoxShadow> shadow;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(18),
      topRight: const Radius.circular(18),
      bottomLeft: Radius.circular(isMe ? 18 : 6),
      bottomRight: Radius.circular(isMe ? 6 : 18),
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (!isMe) _Arrow(color: color, isMe: false),
        Flexible(
          child: Container(
            decoration: BoxDecoration(
              color: color,
              borderRadius: radius,
              border: isMe
                  ? null
                  : Border.all(color: Colors.white.withValues(alpha: 0.56)),
              boxShadow: shadow,
            ),
            child: child,
          ),
        ),
        if (isMe) _Arrow(color: color, isMe: true),
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
      size: const Size(8, 12),
      painter: _ArrowPainter(color: color, isMe: isMe),
    );
  }
}

class _ArrowPainter extends CustomPainter {
  const _ArrowPainter({required this.color, required this.isMe});

  final Color color;
  final bool isMe;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path();
    if (isMe) {
      path
        ..moveTo(0, 0)
        ..lineTo(size.width, size.height)
        ..lineTo(0, size.height * 0.72)
        ..close();
    } else {
      path
        ..moveTo(size.width, 0)
        ..lineTo(0, size.height)
        ..lineTo(size.width, size.height * 0.72)
        ..close();
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _ArrowPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.isMe != isMe;
  }
}
