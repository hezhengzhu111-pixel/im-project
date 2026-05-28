import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class DeferredRoutePage extends StatefulWidget {
  final Future<void> Function() loadLibrary;
  final Widget Function() builder;
  final Widget Function()? loadingBuilder;
  final Widget Function(Object error, VoidCallback retry)? errorBuilder;

  const DeferredRoutePage({
    required this.loadLibrary,
    required this.builder,
    this.loadingBuilder,
    this.errorBuilder,
    super.key,
  });

  @override
  State<DeferredRoutePage> createState() => _DeferredRoutePageState();
}

class _DeferredRoutePageState extends State<DeferredRoutePage> {
  late Future<void> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadLibrary();
  }

  Future<void> _loadLibrary() async {
    await widget.loadLibrary();
  }

  void _retry() {
    setState(() {
      _future = _loadLibrary();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            if (widget.errorBuilder != null) {
              return widget.errorBuilder!(snapshot.error!, _retry);
            }
            return _defaultErrorWidget(snapshot.error!, _retry);
          }
          return widget.builder();
        }

        if (widget.loadingBuilder != null) {
          return widget.loadingBuilder!();
        }
        return _defaultLoadingWidget();
      },
    );
  }

  Widget _defaultLoadingWidget() {
    final loc = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(loc.commonLoading),
        ],
      ),
    );
  }

  Widget _defaultErrorWidget(Object error, VoidCallback retry) {
    final loc = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 16),
          Text(loc.loadingFailed(error.toString())),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: retry,
            child: Text(loc.retry),
          ),
        ],
      ),
    );
  }
}
