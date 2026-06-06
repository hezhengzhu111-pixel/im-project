import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
