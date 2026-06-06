import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'test_providers.dart';

/// Pumps a widget wrapped in ProviderScope + MaterialApp for testing.
///
/// [child] is placed as the home widget.
Future<void> pumpApp(
  WidgetTester tester, {
  required Widget child,
  List<Override> overrides = const [],
}) async {
  final container = createTestContainer(overrides: overrides);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: ThemeData(extensions: [GlassTheme.light]),
        home: child,
      ),
    ),
  );
}
