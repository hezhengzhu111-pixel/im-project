import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart' hide GlassTheme;

import 'glass_theme.dart';

/// Mobile app theme configuration.
///
/// Uses the shared ImTheme from im_ui with mobile-specific GlassTheme
/// extensions applied.
class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme => ImTheme.light().copyWith(
        extensions: [GlassTheme.light],
      );

  static ThemeData get darkTheme => ImTheme.dark().copyWith(
        extensions: [GlassTheme.dark],
      );
}
