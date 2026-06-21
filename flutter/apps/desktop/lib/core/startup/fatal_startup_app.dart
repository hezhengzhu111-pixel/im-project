import 'package:flutter/material.dart';

/// Minimal app shown when a critical startup dependency fails.
///
/// Used by desktop main() when the Rust bridge cannot be initialized. The full
/// provider / app tree is intentionally avoided because subsequent providers
/// may depend on the failed component.
class FatalStartupApp extends StatelessWidget {
  const FatalStartupApp({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 16),
                  Text(message),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
