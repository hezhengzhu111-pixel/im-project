import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/network/network_status_provider.dart';

/// A controllable test double for [NetworkStatusDataSource].
class _TestNetworkDataSource implements NetworkStatusDataSource {
  _TestNetworkDataSource({
    bool isOnline = true,
    bool serverReachable = true,
  })  : _isOnline = isOnline,
        _serverReachable = serverReachable;

  bool _isOnline;
  bool _serverReachable;

  /// Manually-controlled broadcast streams for online / offline events.
  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  // -- NetworkStatusDataSource implementation --

  @override
  bool get isNavigatorOnline => _isOnline;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => _serverReachable;

  // -- Test helpers --

  void setOnline() => _isOnline = true;

  void setOffline() => _isOnline = false;

  void setServerReachable(bool value) => _serverReachable = value;

  /// Simulate the browser firing an "online" event.
  void emitOnline() => _onlineController.add(null);

  /// Simulate the browser firing an "offline" event.
  void emitOffline() => _offlineController.add(null);

  void dispose() {
    _onlineController.close();
    _offlineController.close();
  }
}

void main() {
  // -------------------------------------------------------
  // NetworkState
  // -------------------------------------------------------
  group('NetworkState', () {
    test('defaults to online status', () {
      const state = NetworkState();
      expect(state.status, NetworkStatus.online);
      expect(state.lastChecked, isNull);
      expect(state.retryCount, 0);
      expect(state.isOnline, isTrue);
      expect(state.isOffline, isFalse);
      expect(state.isLimited, isFalse);
    });

    test('copyWith preserves unchanged fields', () {
      const state = NetworkState(
        status: NetworkStatus.offline,
        retryCount: 3,
      );

      final updated = state.copyWith(status: NetworkStatus.online);

      expect(updated.status, NetworkStatus.online);
      expect(updated.retryCount, 3);
    });

    test('copyWith replaces provided fields', () {
      const state = NetworkState(
        status: NetworkStatus.online,
        retryCount: 0,
      );
      final now = DateTime.now();

      final updated = state.copyWith(
        status: NetworkStatus.limited,
        retryCount: 7,
        lastChecked: now,
      );

      expect(updated.status, NetworkStatus.limited);
      expect(updated.retryCount, 7);
      expect(updated.lastChecked, now);
    });

    test('equality is based on status only', () {
      const state1 = NetworkState(status: NetworkStatus.online);
      const state2 = NetworkState(
        status: NetworkStatus.online,
        retryCount: 5,
      );

      expect(state1, equals(state2));
      expect(state1.hashCode, equals(state2.hashCode));
    });

    test('different status produces unequal states', () {
      const online = NetworkState(status: NetworkStatus.online);
      const offline = NetworkState(status: NetworkStatus.offline);

      expect(online, isNot(equals(offline)));
    });
  });

  // -------------------------------------------------------
  // NetworkStatus enum
  // -------------------------------------------------------
  group('NetworkStatus', () {
    test('has exactly three values', () {
      expect(NetworkStatus.values.length, 3);
    });

    test('contains online, limited, offline', () {
      expect(NetworkStatus.values, contains(NetworkStatus.online));
      expect(NetworkStatus.values, contains(NetworkStatus.offline));
      expect(NetworkStatus.values, contains(NetworkStatus.limited));
    });
  });

  // -------------------------------------------------------
  // NetworkStatusNotifier
  // -------------------------------------------------------
  group('NetworkStatusNotifier', () {
    late _TestNetworkDataSource dataSource;

    setUp(() {
      dataSource = _TestNetworkDataSource();
    });

    tearDown(() {
      dataSource.dispose();
    });

    test('initializes with online status when navigator is online', () {
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      expect(notifier.state.isOnline, isTrue);
      expect(notifier.state.lastChecked, isNotNull);
      notifier.dispose();
    });

    test('initializes with offline status when navigator is offline', () {
      dataSource.setOffline();
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      expect(notifier.state.isOffline, isTrue);
      notifier.dispose();
    });

    test('transitions to offline when offline event is emitted', () async {
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      expect(notifier.state.isOnline, isTrue);

      dataSource.emitOffline();
      // Allow the stream listener to process
      await Future<void>.delayed(Duration.zero);

      expect(notifier.state.isOffline, isTrue);
      notifier.dispose();
    });

    test('transitions to online when online event is emitted', () async {
      dataSource.setOffline();
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      expect(notifier.state.isOffline, isTrue);

      dataSource.setOnline();
      dataSource.emitOnline();
      await Future<void>.delayed(Duration.zero);

      expect(notifier.state.isOnline, isTrue);
      notifier.dispose();
    });

    test('forceCheck sets limited when server is unreachable', () async {
      dataSource.setServerReachable(false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();

      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.retryCount, 1);
      notifier.dispose();
    });

    test('forceCheck sets online when server is reachable', () async {
      dataSource.setServerReachable(true);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();

      expect(notifier.state.isOnline, isTrue);
      expect(notifier.state.retryCount, 0);
      notifier.dispose();
    });

    test('forceCheck sets offline when navigator is offline', () async {
      dataSource.setOffline();
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();

      expect(notifier.state.isOffline, isTrue);
      notifier.dispose();
    });

    test('retryCount increments on consecutive failed checks', () async {
      dataSource.setServerReachable(false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();
      expect(notifier.state.retryCount, 1);

      await notifier.forceCheck();
      expect(notifier.state.retryCount, 2);

      await notifier.forceCheck();
      expect(notifier.state.retryCount, 3);

      notifier.dispose();
    });

    test('retryCount resets to 0 on successful check', () async {
      dataSource.setServerReachable(false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();
      expect(notifier.state.retryCount, 1);

      dataSource.setServerReachable(true);
      await notifier.forceCheck();
      expect(notifier.state.retryCount, 0);
      expect(notifier.state.isOnline, isTrue);

      notifier.dispose();
    });

    test('disposes cleanly without errors', () {
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      expect(() => notifier.dispose(), returnsNormally);
    });
  });
}
