import 'package:flutter/material.dart';

class Breakpoints {
  static const double mobile = 600;
  static const double tablet = 900;
}

enum ScreenSize { mobile, tablet, desktop }

ScreenSize getScreenSize(double width) {
  if (width < Breakpoints.mobile) return ScreenSize.mobile;
  if (width < Breakpoints.tablet) return ScreenSize.tablet;
  return ScreenSize.desktop;
}

class ResponsiveLayout extends StatelessWidget {
  const ResponsiveLayout({
    required this.mobile,
    required this.desktop,
    this.tablet,
    super.key,
  });

  final WidgetBuilder mobile;
  final WidgetBuilder desktop;
  final WidgetBuilder? tablet;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = getScreenSize(constraints.maxWidth);
        return switch (size) {
          ScreenSize.mobile => mobile(context),
          ScreenSize.tablet => (tablet ?? desktop)(context),
          ScreenSize.desktop => desktop(context),
        };
      },
    );
  }
}
