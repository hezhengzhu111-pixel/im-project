/// 认证模块的结构化错误码，用于 UI 层按类型展示错误提示。
enum AuthErrorCode {
  /// 用户名或密码错误
  invalidCredentials,

  /// 网络连接错误
  networkError,

  /// 服务器内部错误
  serverError,

  /// 请求过于频繁
  tooManyRequests,

  /// 账号已锁定
  accountLocked,

  /// 未知错误
  unknown,
}
