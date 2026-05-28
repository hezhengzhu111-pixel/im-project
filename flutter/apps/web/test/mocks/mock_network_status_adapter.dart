import 'dart:async';
import 'package:im_core/core.dart';

class MockNetworkStatusAdapter implements NetworkStatusPort {
  NetworkStatus _currentStatus = NetworkStatus.online;
  final _statusController = StreamController<NetworkStatus>.broadcast();

  void setStatus(NetworkStatus status) {
    _currentStatus = status;
    _statusController.add(status);
  }

  @override
  Future<Result<NetworkStatus>> getStatus() async {
    return Success(_currentStatus);
  }

  @override
  Stream<NetworkStatus> onStatusChange() {
    return _statusController.stream;
  }

  void dispose() {
    _statusController.close();
  }
}
