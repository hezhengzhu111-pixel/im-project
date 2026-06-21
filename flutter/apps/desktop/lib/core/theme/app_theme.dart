import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';

/// Application theme for the desktop app.
///
/// Uses the shared [ImTheme] from the `im_ui` package as the base.
/// [ImTheme] 已默认注入 [GlassTheme] 扩展，桌面端可直接复用 Web 端的 Glass 风格页面。
class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme => ImTheme.light();

  static ThemeData get darkTheme => ImTheme.dark();
}
