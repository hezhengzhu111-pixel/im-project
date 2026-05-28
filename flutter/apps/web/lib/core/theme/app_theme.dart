import 'package:flutter/material.dart';
import 'package:im_ui/ui.dart';

import 'glass_theme.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme => ImTheme.light().copyWith(
        extensions: [GlassTheme.light],
      );

  static ThemeData get darkTheme => ImTheme.dark().copyWith(
        extensions: [GlassTheme.dark],
      );
}
