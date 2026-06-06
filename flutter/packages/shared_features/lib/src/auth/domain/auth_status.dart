/// 认证状态枚举，用于表示应用的认证状态
enum AuthStatus {
  /// 初始状态，尚未开始认证检查
  initial,

  /// 正在加载/检查认证状态
  loading,

  /// 已认证
  authenticated,

  /// 未认证
  unauthenticated,
}
