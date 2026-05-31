# 认证流程重构设计文档

## 问题描述

刷新浏览器后，已登录用户会被重定向到登录页面。根本原因是 Flutter 前端的 API 调用方式与后端路由不匹配，导致认证流程中断。

## 根因分析

1. **API 调用方式不匹配**：
   - Flutter 前端用 GET 请求调用 `/user/profile`，但后端只接受 POST
   - 导致 405 Method Not Allowed 错误
   - 这可能影响了认证状态的恢复

2. **认证流程设计问题**：
   - `restoreSession()` 流程过于复杂
   - 缺乏清晰的错误处理和日志
   - 状态管理分散在多个地方

3. **缺少 /auth/parse 请求**：
   - 刷新后应该先调用 `/auth/parse` 验证 token
   - 但实际上没有发出这个请求
   - 可能是因为之前的错误导致流程中断

## 重构目标

1. **修复 API 调用**：确保所有 API 调用方式与后端路由匹配
2. **简化认证流程**：重新设计 restoreSession 流程，使其更清晰
3. **改善错误处理**：添加更好的错误处理和日志
4. **保持 Riverpod**：继续使用 Riverpod 作为状态管理方案

## 设计方案

### 1. 修复 API 调用方式

**问题**：`/user/profile` 等端点使用 GET 请求，但后端只接受 POST

**解决方案**：
- 检查所有 API 调用，确保方法与后端路由匹配
- 修复 `/user/profile`、`/user/settings` 等端点的调用方式

**具体修改**：
```dart
// 修改前：GET 请求
final response = await _dio.get('/user/profile');

// 修改后：POST 请求
final response = await _dio.post('/user/profile', data: {});
```

### 2. 重构认证流程

**当前流程**（过于复杂）：
```
checkAuth() -> restoreSession()
  -> _parseAccessToken(allowExpired: true)
  -> if invalid: _refreshSession()
  -> _parseAccessToken()
  -> if invalid: return unauthenticated
```

**新流程**（更清晰）：
```
checkAuth() -> restoreSession()
  -> tryRefreshToken()
    -> if refresh fails: return unauthenticated
  -> validateToken()
    -> if invalid: return unauthenticated
  -> return authenticated
```

### 3. 简化 AuthState

**当前 AuthState**（字段过多）：
```dart
class AuthState {
  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final AuthErrorCode? errorCode;
  final bool rememberMe;
  final bool authReady;
  final List<String> permissions;
}
```

**新 AuthState**（更简洁）：
```dart
class AuthState {
  final User? user;
  final AuthStatus status; // loading, authenticated, unauthenticated, error
  final String? error;
  final List<String> permissions;
}
```

### 4. 改善错误处理

**当前问题**：
- 错误信息不够清晰
- 缺乏日志记录
- 错误处理分散在多个地方

**解决方案**：
- 统一错误处理逻辑：在 `AuthNotifier` 中集中处理所有认证相关错误
- 添加详细的日志记录：使用 `AppLogger` 记录关键操作和错误
- 使用 Result 类型代替异常：定义 `AuthResult` 类型，包含成功和失败两种情况

**具体实现**：
```dart
// 定义 AuthResult 类型
sealed class AuthResult {
  const AuthResult();
}

class AuthSuccess extends AuthResult {
  const AuthSuccess(this.user, this.permissions);
  final User user;
  final List<String> permissions;
}

class AuthFailure extends AuthResult {
  const AuthFailure(this.error, this.errorCode);
  final String error;
  final AuthErrorCode errorCode;
}

// 在 AuthNotifier 中使用
Future<void> restoreSession() async {
  state = state.copyWith(status: AuthStatus.loading);
  
  final result = await _repository.restoreSession();
  
  switch (result) {
    case AuthSuccess(:final user, :final permissions):
      state = AuthState(
        user: user,
        status: AuthStatus.authenticated,
        permissions: permissions,
      );
      _analytics.setUserId(user.id);
      _connectWs(user.id);
    case AuthFailure(:final error, :final errorCode):
      state = AuthState(
        status: AuthStatus.unauthenticated,
        error: error,
      );
      AppLogger.instance.error('Session restore failed', error, null, 'auth');
  }
}
```

### 5. 改善路由守卫

**当前问题**：
- 路由守卫依赖 `authReady` 标志
- 可能导致竞态条件
- 用户体验不佳（闪烁）

**解决方案**：
- 使用 `AuthStatus` 枚举代替 `authReady` 布尔值
- 添加超时机制：如果 `checkAuth()` 超过 5 秒未完成，自动跳转到登录页
- 改善用户体验：在认证检查期间显示加载状态

**具体实现**：
```dart
// 路由守卫逻辑
redirect: (context, state) {
  final authState = ref.read(authStateProvider);
  final meta = resolveRouteMeta(state.uri.path);

  // 无匹配路由（404）— 放行
  if (meta == null) return null;

  // 认证检查中 — 显示加载状态，不重定向
  if (authState.status == AuthStatus.loading) {
    return null; // 或者返回一个加载页面
  }

  // hideForAuth: 已登录用户访问 /login 或 /register -> /chat
  if (meta.hideForAuth && authState.isAuthenticated) {
    return '/chat';
  }

  // requiresAuth: 未登录 -> /login?redirect=xxx
  if (meta.requiresAuth && !authState.isAuthenticated) {
    return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
  }

  // permission: 用户缺少所需权限 -> /chat
  if (meta.permission != null) {
    if (!authState.permissions.contains(meta.permission!)) {
      return '/chat';
    }
  }

  return null;
}
```

**超时机制**：
```dart
// 在 AuthNotifier 中添加超时
Future<void> restoreSession() async {
  state = state.copyWith(status: AuthStatus.loading);
  
  try {
    final result = await _repository.restoreSession()
        .timeout(const Duration(seconds: 5));
    // ... 处理结果
  } on TimeoutException {
    state = const AuthState(status: AuthStatus.unauthenticated);
    AppLogger.instance.warn('Session restore timed out', 'auth');
  }
}
```

## 实施步骤

### 阶段 1：修复 API 调用（1-2天）

1. 检查所有 API 调用方式
2. 修复 GET/POST 不匹配的问题
3. 测试所有 API 调用

### 阶段 2：重构认证流程（2-3天）

1. 重新设计 AuthState 和 AuthNotifier
2. 简化 restoreSession 流程
3. 改善错误处理和日志

### 阶段 3：改善路由守卫（1天）

1. 重新设计路由守卫逻辑
2. 添加超时机制
3. 改善用户体验

### 阶段 4：测试和优化（1-2天）

1. 编写单元测试
2. 编写集成测试
3. 性能优化

## 预期结果

1. 刷新浏览器后不再返回登录页
2. 认证流程更清晰、更健壮
3. 错误处理更完善
4. 用户体验更好

## 风险评估

1. **兼容性风险**：修改 API 调用方式可能影响其他功能
   - 缓解：逐步修改，充分测试

2. **状态管理风险**：重构状态管理可能导致新的 bug
   - 缓解：保持核心逻辑不变，只重构接口

3. **性能风险**：新的认证流程可能影响性能
   - 缓解：优化关键路径，添加缓存

## 成功标准

1. ✅ 刷新浏览器后不再返回登录页
2. ✅ 所有 API 调用方式与后端匹配
3. ✅ 认证流程更清晰、更健壮
4. ✅ 错误处理更完善
5. ✅ 用户体验更好
6. ✅ 测试覆盖率 > 80%
