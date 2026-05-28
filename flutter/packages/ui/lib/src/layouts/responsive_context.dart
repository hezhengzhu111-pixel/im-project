import 'package:flutter/widgets.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

extension ResponsiveContext on BuildContext {
  Breakpoint get breakpoint => BreakpointScope.of(this);
  bool get isCompact => breakpoint == Breakpoint.compact;
  bool get isMedium => breakpoint == Breakpoint.medium;
  bool get isExpanded => breakpoint == Breakpoint.expanded;
  bool get isLarge => breakpoint == Breakpoint.large;
  bool get isMobile => isCompact || isMedium;
  bool get isDesktop => isExpanded || isLarge;
}
