import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

/// A wrapper that loads a deferred Dart library before building its child.
///
/// Use this with `deferred as` imports to split low-frequency routes into
/// separate JS chunks, reducing the initial `main.dart.js` download.
class DeferredRoutePage<T> extends StatefulWidget {
  const DeferredRoutePage({
    super.key,
    required this.loadLibrary,
    required this.builder,
    this.loadingBuilder,
    this.errorBuilder,
  });

  /// Future returned by `deferredLibrary.loadLibrary()`.
  final Future<void> Function() loadLibrary;

  /// Builds the actual page after the library has loaded.
  final Widget Function() builder;

  /// Optional custom loading widget. Defaults to a centered progress indicator.
  final WidgetBuilder? loadingBuilder;

  /// Optional error widget. Defaults to a retry button.
  final Widget Function(BuildContext context, VoidCallback retry)? errorBuilder;

  @override
  State<DeferredRoutePage> createState() => _DeferredRoutePageState();
}

class _DeferredRoutePageState extends State<DeferredRoutePage> {
  Future<void>? _loadFuture;

  @override
  void initState() {
    super.initState();
    _loadFuture = widget.loadLibrary();
  }

  void _retry() {
    setState(() {
      _loadFuture = widget.loadLibrary();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _loadFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            return _ErrorView(
              error: snapshot.error,
              onRetry: _retry,
              errorBuilder: widget.errorBuilder,
            );
          }
          return widget.builder();
        }
        if (widget.loadingBuilder != null) {
          return widget.loadingBuilder!(context);
        }
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      },
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.error,
    required this.onRetry,
    this.errorBuilder,
  });

  final Object? error;
  final VoidCallback onRetry;
  final Widget Function(BuildContext context, VoidCallback retry)? errorBuilder;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    if (errorBuilder != null) {
      return errorBuilder!(context, onRetry);
    }
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 48),
            const SizedBox(height: 16),
            Text(loc.pageLoadFailed,
                style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 8),
            Text(
              error?.toString() ?? '',
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).textTheme.bodySmall?.color,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(loc.retry),
            ),
          ],
        ),
      ),
    );
  }
}
