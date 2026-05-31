import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';

/// Application theme for the desktop app.
///
/// Uses the shared [ImTheme] from the `im_ui` package as the base.
class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme => ImTheme.light();

  static ThemeData get darkTheme => ImTheme.dark();
}
