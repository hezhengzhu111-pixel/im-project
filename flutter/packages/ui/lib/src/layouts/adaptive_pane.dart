import 'package:flutter/widgets.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

class AdaptivePane extends StatelessWidget {
  const AdaptivePane({
    this.compact,
    this.medium,
    this.expanded,
    this.large,
    super.key,
  });

  final Widget? compact;
  final Widget? medium;
  final Widget? expanded;
  final Widget? large;

  @override
  Widget build(BuildContext context) {
    final bp = BreakpointScope.of(context);
    return _resolve(bp);
  }

  Widget _resolve(Breakpoint bp) {
    switch (bp) {
      case Breakpoint.compact:
        return compact ?? medium ?? expanded ?? large ?? const SizedBox.shrink();
      case Breakpoint.medium:
        return medium ?? expanded ?? large ?? compact ?? const SizedBox.shrink();
      case Breakpoint.expanded:
        return expanded ?? large ?? medium ?? compact ?? const SizedBox.shrink();
      case Breakpoint.large:
        return large ?? expanded ?? medium ?? compact ?? const SizedBox.shrink();
    }
  }
}
