import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/src/network/ws_connection_state.dart';

import '../di/providers.dart';

/// A debug panel that shows app state information.
/// Only visible in debug or profile mode.
class DebugPanel extends ConsumerWidget {
  const DebugPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!kDebugMode) return const SizedBox.shrink();

    final authState = ref.watch(authStateProvider);
    final wsState = ref.watch(wsStateProvider);
    final chatState = ref.watch(chatStateProvider);
    final route = GoRouterState.of(context);

    return Container(
      width: 240,
      decoration: const BoxDecoration(
        color: Colors.black87,
      ),
      padding: const EdgeInsets.all(12),
      child: DefaultTextStyle(
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontFamily: 'monospace',
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'DEBUG PANEL',
              style: TextStyle(
                color: Colors.amber,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
            const Divider(color: Colors.white30, height: 16),

            // Auth state
            _buildSection(
              title: 'Auth',
              value: authState.isAuthenticated
                  ? 'Authenticated (${authState.user?.id ?? "unknown"})'
                  : 'Unauthenticated',
              color: authState.isAuthenticated ? Colors.green : Colors.red,
            ),
            const SizedBox(height: 8),

            // WS connection state
            _buildSection(
              title: 'WebSocket',
              value: wsState.when(
                data: (state) => state.name,
                loading: () => 'loading',
                error: (e, _) => 'error: $e',
              ),
              color: wsState.when(
                data: (state) => state == WsConnectionState.connected
                    ? Colors.green
                    : state == WsConnectionState.connecting
                        ? Colors.orange
                        : Colors.red,
                loading: () => Colors.orange,
                error: (_, __) => Colors.red,
              ),
            ),
            const SizedBox(height: 8),

            // Active route
            _buildSection(
              title: 'Route',
              value: route.uri.path,
              color: Colors.cyan,
            ),
            const SizedBox(height: 8),

            // Active session
            _buildSection(
              title: 'Session',
              value: chatState.activeSessionId ?? 'none',
              color: chatState.activeSessionId != null
                  ? Colors.green
                  : Colors.grey,
            ),
            const SizedBox(height: 8),

            // Session count
            _buildSection(
              title: 'Sessions',
              value: '${chatState.sessions.length}',
              color: Colors.white,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required String value,
    required Color color,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 11,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
