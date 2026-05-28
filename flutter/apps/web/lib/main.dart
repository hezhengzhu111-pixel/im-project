import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/observer/app_provider_observer.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  runApp(ProviderScope(
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
