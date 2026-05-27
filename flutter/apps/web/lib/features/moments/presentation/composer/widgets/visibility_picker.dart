import 'package:flutter/material.dart';

enum MomentVisibility {
  public(0, '公开', Icons.public),
  friends(1, '好友可见', Icons.person),
  self(2, '仅自己', Icons.lock);

  const MomentVisibility(this.value, this.label, this.icon);
  final int value;
  final String label;
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
          label: Text(v.label, style: const TextStyle(fontSize: 12)),
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
