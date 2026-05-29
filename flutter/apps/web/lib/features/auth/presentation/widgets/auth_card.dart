import 'package:flutter/material.dart';

class AuthCard extends StatelessWidget {
  final Widget child;
  final String title;
  final String subtitle;

  const AuthCard({
    super.key,
    required this.child,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(36),
      decoration: BoxDecoration(
        // 纯白色背景 — 绝对纯净
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        // 柔和弥散阴影 — 悬浮感
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000), // Colors.black.withOpacity(0.08)
            blurRadius: 40,
            spreadRadius: 0,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: Colors.blueGrey.shade900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 14,
              color: Colors.blueGrey.shade400,
            ),
          ),
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }
}
