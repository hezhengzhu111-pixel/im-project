import 'package:flutter/widgets.dart';
import 'breakpoint.dart';

class BreakpointScope extends StatelessWidget {
  const BreakpointScope({required this.child, super.key});

  final Widget child;

  static Breakpoint of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_BreakpointData>();
    return scope?.breakpoint ?? Breakpoint.compact;
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final bp = Breakpoint.fromWidth(width);
    return _BreakpointData(breakpoint: bp, child: child);
  }
}

class _BreakpointData extends InheritedWidget {
  const _BreakpointData({required this.breakpoint, required super.child});

  final Breakpoint breakpoint;

  @override
  bool updateShouldNotify(_BreakpointData old) => breakpoint != old.breakpoint;
}
