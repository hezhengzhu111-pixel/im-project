import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'glass_theme.dart';

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      textTheme: GoogleFonts.notoSansScTextTheme(),
      extensions: [GlassTheme.light],
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      brightness: Brightness.dark,
      textTheme:
          GoogleFonts.notoSansScTextTheme(ThemeData.dark().textTheme),
      extensions: [GlassTheme.dark],
    );
  }
}
