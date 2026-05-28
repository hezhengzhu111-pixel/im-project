import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Network connectivity status
enum NetworkStatus {
  online,
  limited,
  offline,
}

/// State for network status
class NetworkState {
  const NetworkState({
    this.status = NetworkStatus.online,
    this.lastChecked,
    this.retryCount = 0,
  });

  final NetworkStatus status;
  final DateTime? lastChecked;
  final int retryCount;

  bool get isOnline => status == NetworkStatus.online;
  bool get isOffline => status == NetworkStatus.offline;
  bool get isLimited => status == NetworkStatus.limited;

  NetworkState copyWith({
    NetworkStatus? status,
    DateTime? lastChecked,
    int? retryCount,
  }) {
    return NetworkState(
      status: status ?? this.status,
      lastChecked: lastChecked ?? this.lastChecked,
      retryCount: retryCount ?? this.retryCount,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is NetworkState &&
          runtimeType == other.runtimeType &&
          status == other.status;

  @override
  int get hashCode => status.hashCode;
}

/// Abstract interface for platform-specific network operations
abstract class NetworkStatusDataSource {
  bool get isNavigatorOnline;
  Stream<void> get onOnline;
  Stream<void> get onOffline;
  Future<bool> checkServerReachable(String url);
}

/// Platform implementation using dart:html (injected from web adapters)
class WebNetworkStatusDataSource implements NetworkStatusDataSource {
  WebNetworkStatusDataSource._();

  static WebNetworkStatusDataSource? _instance;

  /// Initialize with dart:html types passed in from the web entrypoint
  static void Function()? _onOnlineListener;
  static void Function()? _onOfflineListener;
  static final _onlineController = StreamController<void>.broadcast();
  static final _offlineController = StreamController<void>.broadcast();
  static bool Function()? _isOnlineCheck;
  static Future<bool> Function(String)? _serverCheck;

  static void initialize({
    required bool Function() isOnlineCheck,
    required Stream<void> Function() onOnlineStream,
    required Stream<void> Function() onOfflineStream,
    required Future<bool> Function(String) serverCheck,
  }) {
    _isOnlineCheck = isOnlineCheck;
    _serverCheck = serverCheck;
    onOnlineStream().listen((_) => _onlineController.add(null));
    onOfflineStream().listen((_) => _offlineController.add(null));
  }

  @override
  bool get isNavigatorOnline => _isOnlineCheck?.call() ?? true;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async {
    return _serverCheck?.call(url) ?? Future.value(true);
  }
}

/// Notifier that monitors network connectivity
class NetworkStatusNotifier extends StateNotifier<NetworkState> {
  NetworkStatusNotifier({NetworkStatusDataSource? dataSource})
      : _dataSource = dataSource ?? _defaultDataSource(),
        super(const NetworkState()) {
    _init();
  }

  final NetworkStatusDataSource _dataSource;
  StreamSubscription<void>? _onlineSubscription;
  StreamSubscription<void>? _offlineSubscription;
  Timer? _connectivityCheckTimer;

  /// Stream of state changes for listeners that cannot use Riverpod
  final _stateChangesController = StreamController<NetworkState>.broadcast();
  Stream<NetworkState> get stateChanges => _stateChangesController.stream;

  @override
  set state(NetworkState value) {
    super.state = value;
    _stateChangesController.add(value);
  }

  static const _checkInterval = Duration(minutes: 1);
  static const _connectivityCheckUrl = '/api/health';

  static NetworkStatusDataSource _defaultDataSource() {
    // In tests, use a simple stub; on web, the actual implementation is injected
    return _StubNetworkDataSource();
  }

  void _init() {
    final isOnline = _dataSource.isNavigatorOnline;
    state = NetworkState(
      status: isOnline ? NetworkStatus.online : NetworkStatus.offline,
      lastChecked: DateTime.now(),
    );

    _onlineSubscription = _dataSource.onOnline.listen((_) {
      _handleOnline();
    });

    _offlineSubscription = _dataSource.onOffline.listen((_) {
      _handleOffline();
    });

    _connectivityCheckTimer = Timer.periodic(_checkInterval, (_) {
      checkConnectivity();
    });
  }

  void _handleOnline() {
    state = state.copyWith(
      status: NetworkStatus.online,
      lastChecked: DateTime.now(),
      retryCount: 0,
    );
    checkConnectivity();
  }

  void _handleOffline() {
    state = state.copyWith(
      status: NetworkStatus.offline,
      lastChecked: DateTime.now(),
    );
  }

  Future<void> checkConnectivity() async {
    if (!_dataSource.isNavigatorOnline) {
      state = state.copyWith(
        status: NetworkStatus.offline,
        lastChecked: DateTime.now(),
      );
      return;
    }

    try {
      final reachable = await _dataSource.checkServerReachable(_connectivityCheckUrl);
      state = state.copyWith(
        status: reachable ? NetworkStatus.online : NetworkStatus.limited,
        lastChecked: DateTime.now(),
        retryCount: reachable ? 0 : state.retryCount + 1,
      );
    } catch (e) {
      state = state.copyWith(
        status: NetworkStatus.limited,
        lastChecked: DateTime.now(),
        retryCount: state.retryCount + 1,
      );
    }
  }

  Future<void> forceCheck() async {
    await checkConnectivity();
  }

  @override
  void dispose() {
    _onlineSubscription?.cancel();
    _offlineSubscription?.cancel();
    _connectivityCheckTimer?.cancel();
    _stateChangesController.close();
    super.dispose();
  }
}

/// Stub data source for non-web platforms / tests
class _StubNetworkDataSource implements NetworkStatusDataSource {
  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  @override
  bool get isNavigatorOnline => true;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => true;
}

/// Provider for network status
final networkStatusProvider =
    StateNotifierProvider<NetworkStatusNotifier, NetworkState>((ref) {
  final notifier = NetworkStatusNotifier();
  ref.onDispose(() => notifier.dispose());
  return notifier;
});

/// Convenience provider to check if online
final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(networkStatusProvider).isOnline;
});
