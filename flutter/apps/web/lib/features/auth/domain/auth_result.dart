import 'package:im_core/core.dart';

import 'auth_error_code.dart';

/// 认证结果类型，使用 sealed class 实现类型安全的错误处理
///
/// 这个类提供了两种可能的认证结果：
/// - [AuthSuccess]: 认证成功，包含用户信息和权限列表
/// - [AuthFailure]: 认证失败，包含错误信息和错误代码
///
/// 使用 sealed class 可以确保在模式匹配时处理所有可能的情况，
/// 提供编译时的类型安全性。
sealed class AuthResult {
  const AuthResult();
}

/// 认证成功的结果
///
/// 包含认证成功后的用户信息和权限列表。
/// 在处理认证响应时使用此类表示操作成功完成。
class AuthSuccess extends AuthResult {
  /// 创建认证成功的结果
  ///
  /// [user] 是认证成功的用户对象
  /// [permissions] 是用户拥有的权限列表
  const AuthSuccess({
    required this.user,
    required this.permissions,
  });

  /// 认证成功的用户对象
  final User user;

  /// 用户拥有的权限列表
  final List<String> permissions;
}

/// 认证失败的结果
///
/// 包含认证失败时的错误信息和可选的错误代码。
/// 用于表示认证过程中发生的各种错误情况。
class AuthFailure extends AuthResult {
  /// 创建认证失败的结果
  ///
  /// [error] 是错误的描述信息
  /// [errorCode] 是可选的错误代码，用于程序化处理不同类型的错误
  const AuthFailure({
    required this.error,
    this.errorCode,
  });

  /// 错误的描述信息
  final String error;

  /// 错误代码，用于程序化处理不同类型的错误
  ///
  /// 当需要根据错误类型进行不同处理时，可以使用此字段
  final AuthErrorCode? errorCode;
}
