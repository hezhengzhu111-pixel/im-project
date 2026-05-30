import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

enum MomentVisibility {
  public(0, Icons.public),
  friends(1, Icons.person),
  self(2, Icons.lock);

  const MomentVisibility(this.value, this.icon);
  final int value;
  final IconData icon;
}

class VisibilityPicker extends StatelessWidget {
  const VisibilityPicker({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final MomentVisibility value;
  final ValueChanged<MomentVisibility> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<MomentVisibility>(
      segments: MomentVisibility.values.map((v) {
        return ButtonSegment<MomentVisibility>(
          value: v,
          label: Text(visibilityLabel(context, v),
              style: const TextStyle(fontSize: 12)),
          icon: Icon(v.icon, size: 16),
        );
      }).toList(),
      selected: {value},
      onSelectionChanged: (selected) {
        if (selected.isNotEmpty) onChanged(selected.first);
      },
      style: SegmentedButton.styleFrom(
        visualDensity: VisualDensity.compact,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
    );
  }
}

String visibilityLabel(BuildContext context, MomentVisibility level) {
  final l10n = AppLocalizations.of(context)!;
  return switch (level) {
    MomentVisibility.public => l10n.momentsVisibilityPublic,
    MomentVisibility.friends => l10n.momentsVisibilityFriends,
    MomentVisibility.self => l10n.momentsVisibilitySelf,
  };
}
