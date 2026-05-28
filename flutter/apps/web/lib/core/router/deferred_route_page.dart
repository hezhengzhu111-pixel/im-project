import 'package:flutter/material.dart';

class DeferredRoutePage<T> extends StatefulWidget {
  final Future<void> Function() loadLibrary;
  final T Function() builder;
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
  State<DeferredRoutePage<T>> createState() => _DeferredRoutePageState<T>();
}

class _DeferredRoutePageState<T> extends State<DeferredRoutePage<T>> {
  late Future<void> _future;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _future = _loadLibrary();
  }

  Future<void> _loadLibrary() async {
    try {
      await widget.loadLibrary();
      if (mounted) {
        setState(() {
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
        });
      }
    }
  }

  void _retry() {
    setState(() {
      _error = null;
      _future = _loadLibrary();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      if (widget.errorBuilder != null) {
        return widget.errorBuilder!(_error!, _retry);
      }
      return _defaultErrorWidget(_error!, _retry);
    }

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
          return widget.builder() as Widget;
        }

        if (widget.loadingBuilder != null) {
          return widget.loadingBuilder!();
        }
        return _defaultLoadingWidget();
      },
    );
  }

  Widget _defaultLoadingWidget() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('加载中...'),
        ],
      ),
    );
  }

  Widget _defaultErrorWidget(Object error, VoidCallback retry) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 16),
          Text('加载失败: $error'),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: retry,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }
}
