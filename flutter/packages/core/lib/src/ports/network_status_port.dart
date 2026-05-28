import 'dart:async';
import '../models/result.dart';

abstract class NetworkStatusPort {
  /// 获取当前连接状态
  Future<Result<NetworkStatus>> getStatus();

  /// 监听网络状态变化
  Stream<NetworkStatus> onStatusChange();
}

enum NetworkStatus { online, offline, unknown }
