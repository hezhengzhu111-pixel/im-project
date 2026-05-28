import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import 'debug_panel.dart';

/// A floating action button that toggles the debug panel visibility.
/// Only visible in debug or profile mode.
class DebugPanelEntry extends StatefulWidget {
  const DebugPanelEntry({super.key});

  @override
  State<DebugPanelEntry> createState() => _DebugPanelEntryState();
}

class _DebugPanelEntryState extends State<DebugPanelEntry> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return const SizedBox.shrink();

    return Stack(
      children: [
        // Tap-outside-to-dismiss overlay
        if (_isExpanded)
          Positioned.fill(
            child: GestureDetector(
              onTap: () => setState(() => _isExpanded = false),
              behavior: HitTestBehavior.translucent,
              child: const SizedBox.expand(),
            ),
          ),

        // Debug panel overlay
        if (_isExpanded)
          Positioned(
            right: 56,
            bottom: 16,
            child: Material(
              elevation: 8,
              borderRadius: BorderRadius.circular(8),
              clipBehavior: Clip.antiAlias,
              child: const DebugPanel(),
            ),
          ),

        // FAB toggle button
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.small(
            heroTag: 'debug_panel_fab',
            onPressed: () {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            backgroundColor: _isExpanded ? Colors.amber : Colors.grey,
            child: Icon(
              _isExpanded ? Icons.close : Icons.bug_report,
              color: Colors.white,
              size: 20,
            ),
          ),
        ),
      ],
    );
  }
}
