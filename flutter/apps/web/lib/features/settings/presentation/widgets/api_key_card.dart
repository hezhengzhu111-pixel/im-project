import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';

class ApiKeyCard extends StatelessWidget {
  const ApiKeyCard({
    required this.apiKey,
    required this.onTest,
    required this.onDelete,
    this.isTesting = false,
    super.key,
  });

  final AiApiKey apiKey;
  final VoidCallback onTest;
  final VoidCallback onDelete;
  final bool isTesting;

  IconData _providerIcon(String provider) {
    switch (provider.toLowerCase()) {
      case 'deepseek':
        return Icons.auto_awesome;
      case 'minimax':
        return Icons.psychology;
      case 'openai':
        return Icons.smart_toy;
      default:
        return Icons.key;
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'valid':
      case 'active':
        return Colors.green;
      case 'invalid':
      case 'expired':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;
    final maskedKey = apiKey.key.length > 8
        ? '${apiKey.key.substring(0, 4)}****${apiKey.key.substring(apiKey.key.length - 4)}'
        : '****';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(_providerIcon(apiKey.provider),
                size: 32, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    apiKey.label ?? apiKey.provider,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    maskedKey,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: _statusColor(apiKey.status).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                apiKey.status,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: _statusColor(apiKey.status),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: isTesting ? null : onTest,
              icon: isTesting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child:
                          CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.wifi_find, size: 20),
              tooltip: loc.aiTestConnection,
            ),
            IconButton(
              onPressed: onDelete,
              icon: Icon(Icons.delete_outline,
                  size: 20, color: theme.colorScheme.error),
              tooltip: loc.aiDeleteKey,
            ),
          ],
        ),
      ),
    );
  }
}
