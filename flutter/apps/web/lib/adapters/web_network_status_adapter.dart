import 'dart:async';
import 'package:im_core/core.dart';

class WebNetworkStatusAdapter implements NetworkStatusPort {
  final _statusController = StreamController<NetworkStatus>.broadcast();

  WebNetworkStatusAdapter() {
    _initListeners();
  }

  void _initListeners() {
    // 实际实现需要通过 dart:js_interop 监听 online/offline 事件
  }

  @override
  Future<Result<NetworkStatus>> getStatus() async {
    try {
      // 实际实现需要通过 dart:js_interop 检查 navigator.onLine
      return const Success(NetworkStatus.online);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Stream<NetworkStatus> onStatusChange() {
    return _statusController.stream;
  }

  void dispose() {
    _statusController.close();
  }
}
