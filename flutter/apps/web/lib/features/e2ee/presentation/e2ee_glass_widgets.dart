import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';

class E2eeStatusPill extends StatelessWidget {
  const E2eeStatusPill({required this.status, super.key});

  final E2eeSessionStatus status;

  @override
  Widget build(BuildContext context) {
    final data = switch (status) {
      E2eeSessionStatus.plaintext => (
          label: '明文聊天',
          icon: Icons.lock_open_outlined,
          fg: const Color(0xFF73798B),
          bg: Colors.white.withValues(alpha: 0.66),
          border: Colors.white.withValues(alpha: 0.72),
        ),
      E2eeSessionStatus.negotiating => (
          label: '协商中',
          icon: Icons.sync_outlined,
          fg: const Color(0xFF9A6A12),
          bg: const Color(0xFFFFF6DA).withValues(alpha: 0.92),
          border: const Color(0xFFD69A1E).withValues(alpha: 0.22),
        ),
      E2eeSessionStatus.encrypted => (
          label: '已端到端加密',
          icon: Icons.lock_outline,
          fg: const Color(0xFF6841BD),
          bg: const Color(0xFFEFE7FF).withValues(alpha: 0.92),
          border: imGlassBrand.withValues(alpha: 0.24),
        ),
      E2eeSessionStatus.failed => (
          label: '加密失败',
          icon: Icons.error_outline,
          fg: const Color(0xFFBA3247),
          bg: const Color(0xFFFFE8EC).withValues(alpha: 0.92),
          border: const Color(0xFFEF5B6C).withValues(alpha: 0.22),
        ),
    };

    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: data.bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: data.border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF222646).withValues(alpha: 0.06),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(data.icon, size: 15, color: data.fg),
          const SizedBox(width: 7),
          Text(
            data.label,
            style: TextStyle(
              color: data.fg,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class E2eeNegotiationBanner extends StatelessWidget {
  const E2eeNegotiationBanner({
    required this.status,
    this.pending,
    this.onAccept,
    this.onReject,
    this.onExit,
    this.onStart,
    super.key,
  });

  final E2eeSessionStatus status;
  final E2eeNegotiationEvent? pending;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;
  final VoidCallback? onExit;
  final VoidCallback? onStart;

  @override
  Widget build(BuildContext context) {
    if (pending != null && pending!.action == E2eeNegotiationAction.request) {
      return _PendingRequestBanner(
        event: pending!,
        onAccept: onAccept,
        onReject: onReject,
      );
    }

    return switch (status) {
      E2eeSessionStatus.negotiating => const _InitiatingBanner(),
      E2eeSessionStatus.encrypted => _EncryptedTip(onExit: onExit),
      E2eeSessionStatus.failed => _FailedBanner(
          onStart: onStart,
          onExit: onExit,
        ),
      E2eeSessionStatus.plaintext => const SizedBox.shrink(),
    };
  }
}

class _InitiatingBanner extends StatelessWidget {
  const _InitiatingBanner();

  @override
  Widget build(BuildContext context) {
    return _BannerFrame(
      icon: Icons.sync_outlined,
      color: const Color(0xFF9A6A12),
      title: '正在发起端到端加密',
      description: '正在注册设备、获取对方公钥并创建本地加密会话，完成后需要对方确认',
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: const [
          _StepChip(index: 1, title: '设备', detail: '校验本机密钥材料'),
          _StepChip(index: 2, title: '公钥', detail: '获取对方 PreKey Bundle'),
          _StepChip(index: 3, title: '会话', detail: '创建本地 outbound session'),
          _StepChip(index: 4, title: '等待', detail: '等待对方接受请求'),
        ],
      ),
    );
  }
}

class _PendingRequestBanner extends StatelessWidget {
  const _PendingRequestBanner({
    required this.event,
    this.onAccept,
    this.onReject,
  });

  final E2eeNegotiationEvent event;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  @override
  Widget build(BuildContext context) {
    final requester = event.requesterName ?? event.requesterId;
    final payload = _tryDecode(event.requestPayloadJson);
    final device = _firstText(payload, [
      'deviceId',
      'device_id',
      'senderDeviceId',
      'sender_device_id',
    ]);
    final verifyCode = _firstText(payload, [
      'verifyCode',
      'verify_code',
      'safetyNumber',
      'safety_number',
      'fingerprint',
    ]);

    return _BannerFrame(
      icon: Icons.lock_clock_outlined,
      color: imGlassBrand,
      title: '$requester 请求开启端到端加密',
      description: '请确认请求方和设备信息后再接受。',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoChip(label: '请求方', value: requester),
              _InfoChip(label: '设备', value: device ?? '待确认'),
              if (verifyCode != null)
                _InfoChip(label: '校验码', value: verifyCode),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              PrimarySolidButton(
                label: '接受',
                icon: Icons.check,
                compact: true,
                onPressed: onAccept,
              ),
              const SizedBox(width: 10),
              TextButton(
                onPressed: onReject,
                child: const Text('拒绝'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Map<String, dynamic>? _tryDecode(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  static String? _firstText(Map<String, dynamic>? source, List<String> keys) {
    if (source == null) return null;
    for (final key in keys) {
      final value = source[key]?.toString().trim();
      if (value != null && value.isNotEmpty && value != 'null') return value;
    }
    return null;
  }
}

class _EncryptedTip extends StatefulWidget {
  const _EncryptedTip({this.onExit});

  final VoidCallback? onExit;

  @override
  State<_EncryptedTip> createState() => _EncryptedTipState();
}

class _EncryptedTipState extends State<_EncryptedTip> {
  bool _hidden = false;

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    return _BannerFrame(
      icon: Icons.lock_outline,
      color: imGlassBrand,
      title: '已端到端加密',
      description: '消息发送前会在本机加密，服务端只保存加密信封。',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.onExit != null)
            TextButton(onPressed: widget.onExit, child: const Text('退出加密')),
          IconButton(
            tooltip: '关闭',
            onPressed: () => setState(() => _hidden = true),
            icon: const Icon(Icons.close, size: 18),
          ),
        ],
      ),
    );
  }
}

class _FailedBanner extends StatelessWidget {
  const _FailedBanner({this.onStart, this.onExit});

  final VoidCallback? onStart;
  final VoidCallback? onExit;

  @override
  Widget build(BuildContext context) {
    return _BannerFrame(
      icon: Icons.error_outline,
      color: const Color(0xFFBA3247),
      title: '加密失败',
      description: '端到端加密状态异常，请重新发起或退出加密。',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onStart != null)
            PrimarySolidButton(
              label: '重新发起',
              compact: true,
              onPressed: onStart,
            ),
          if (onExit != null)
            TextButton(onPressed: onExit, child: const Text('退出加密')),
        ],
      ),
    );
  }
}

class _BannerFrame extends StatelessWidget {
  const _BannerFrame({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
    this.child,
    this.trailing,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;
  final Widget? child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: GlassPanel(
        borderRadius: 18,
        backgroundColor: Colors.white.withValues(alpha: 0.62),
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                  if (child != null) ...[
                    const SizedBox(height: 12),
                    child!,
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 12),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _StepChip extends StatelessWidget {
  const _StepChip({
    required this.index,
    required this.title,
    required this.detail,
  });

  final int index;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.74),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            backgroundColor: const Color(0xFFFFD36A),
            child: Text(
              '$index',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$title：$detail',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        '$label：$value',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class MessageBubbleE2eeBadge extends StatelessWidget {
  const MessageBubbleE2eeBadge({required this.isMe, super.key});

  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final color = isMe ? Colors.white.withValues(alpha: 0.82) : imGlassBrand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: isMe
            ? Colors.white.withValues(alpha: 0.16)
            : imGlassBrand.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_outline, size: 11, color: color),
          const SizedBox(width: 3),
          Text(
            'E2EE',
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
