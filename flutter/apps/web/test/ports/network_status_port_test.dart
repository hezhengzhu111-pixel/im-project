import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_network_status_adapter.dart';

void main() {
  group('NetworkStatusPort', () {
    late MockNetworkStatusAdapter adapter;

    setUp(() {
      adapter = MockNetworkStatusAdapter();
    });

    tearDown(() {
      adapter.dispose();
    });

    test('getStatus 在线', () async {
      adapter.setStatus(NetworkStatus.online);

      final result = await adapter.getStatus();

      expect(result, isA<Success<NetworkStatus>>());
      expect((result as Success).data, NetworkStatus.online);
    });

    test('getStatus 离线', () async {
      adapter.setStatus(NetworkStatus.offline);

      final result = await adapter.getStatus();

      expect(result, isA<Success<NetworkStatus>>());
      expect((result as Success).data, NetworkStatus.offline);
    });

    test('onStatusChange 监听状态变化', () async {
      final statuses = <NetworkStatus>[];
      adapter.onStatusChange().listen((s) => statuses.add(s));

      adapter.setStatus(NetworkStatus.offline);
      adapter.setStatus(NetworkStatus.online);

      expect(statuses, [NetworkStatus.offline, NetworkStatus.online]);
    });
  });
}