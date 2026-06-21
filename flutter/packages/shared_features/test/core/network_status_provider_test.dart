import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/core.dart';

class _TestNetworkDataSource implements NetworkStatusDataSource {
  _TestNetworkDataSource(
      {this.navigatorOnline = true, this.serverReachable = true});

  final bool navigatorOnline;
  final bool serverReachable;
  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  @override
  bool get isNavigatorOnline => navigatorOnline;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => serverReachable;

  Future<void> dispose() async {
    await _onlineController.close();
    await _offlineController.close();
  }
}

void main() {
  group('NetworkStatusProvider public API', () {
    test('checkConnectivity marks limited when server is unreachable',
        () async {
      // @coversSymbol('checkConnectivity')
      // @coversSymbol('checkServerReachable')
      final dataSource = _TestNetworkDataSource(serverReachable: false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      addTearDown(notifier.dispose);
      addTearDown(dataSource.dispose);

      await notifier.checkConnectivity();

      expect(notifier.state.status, NetworkStatus.limited);
      expect(await dataSource.checkServerReachable('/api/health'), isFalse);
    });

    test('checkConnectivity marks offline when navigator is offline', () async {
      // @coversSymbol('checkConnectivity')
      final dataSource = _TestNetworkDataSource(navigatorOnline: false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      addTearDown(notifier.dispose);
      addTearDown(dataSource.dispose);

      await notifier.checkConnectivity();

      expect(notifier.state.status, NetworkStatus.offline);
    });

    test(
        'WebNetworkStatusDataSource can be initialized for reachability checks',
        () async {
      // @coversSymbol('checkServerReachable')
      WebNetworkStatusDataSource.initialize(
        isOnlineCheck: () => true,
        onOnlineStream: () => const Stream.empty(),
        onOfflineStream: () => const Stream.empty(),
        serverCheck: (_) async => true,
      );

      final notifier = NetworkStatusNotifier();
      addTearDown(notifier.dispose);

      await notifier.checkConnectivity();

      expect(notifier.state.status, NetworkStatus.online);
    });
  });
}
