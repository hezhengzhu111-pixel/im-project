import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppProviderObserver extends ProviderObserver {
  AppProviderObserver({this.env = 'development'});

  final String env;

  bool get _isDevelopment => env == 'development';

  bool isSensitive(String name) {
    const prefixes = ['auth', 'token', 'secure', 'wsclient'];
    return prefixes.any(name.toLowerCase().contains);
  }

  @override
  void didAddProvider(
    ProviderBase<Object?> provider,
    Object? value,
    ProviderContainer container,
  ) {
    if (!_isDevelopment) return;
    final name = provider.name ?? provider.runtimeType.toString();
    if (isSensitive(name)) return;
    debugPrint('[Provider] add: $name');
  }

  @override
  void didUpdateProvider(
    ProviderBase<Object?> provider,
    Object? previousValue,
    Object? newValue,
    ProviderContainer container,
  ) {
    if (!_isDevelopment) return;
    final name = provider.name ?? provider.runtimeType.toString();
    if (isSensitive(name)) return;

    final prevSummary = _summarize(previousValue);
    final nextSummary = _summarize(newValue);
    debugPrint('[Provider] update: $name ($prevSummary -> $nextSummary)');
  }

  String _summarize(Object? value) {
    if (value == null) return 'null';
    if (value is StateNotifier) {
      return value.state.runtimeType.toString();
    }
    return value.runtimeType.toString();
  }
}
