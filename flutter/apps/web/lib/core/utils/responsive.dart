import 'package:flutter/material.dart';

class ResponsiveLayout {
  static const double mobile = 600;
  static const double tablet = 1024;

  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < mobile;

  static bool isTablet(BuildContext context) =>
      MediaQuery.of(context).size.width >= mobile &&
      MediaQuery.of(context).size.width < tablet;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= tablet;

  static double getMaxWidth(BuildContext context) {
    if (isMobile(context)) {
      return double.infinity;
    }
    return 400;
  }

  static double getCardElevation(BuildContext context) {
    return isMobile(context) ? 0 : 8;
  }

  static double getCardMargin(BuildContext context) {
    return isMobile(context) ? 16 : 32;
  }

  static double getCardPadding(BuildContext context) {
    return isMobile(context) ? 24 : 32;
  }
}
