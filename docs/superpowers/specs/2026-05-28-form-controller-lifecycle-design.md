# FormController 生命周期修复 + Auth 错误映射

## 概述

修复 LoginPage / RegisterPage 中 FormController 在 `build()` 中创建导致的生命周期问题，统一 auth 错误通过错误码 + i18n 展示，修复 AuthState.copyWith 隐含 bug。

## 问题分析

### 1. FormController 在 build() 中重建

LoginPage 和 RegisterPage 都在 `build()` 中执行：
- `_formController = FormController(...)` — 每次 rebuild 创建新实例，丢失字段值、touched 状态、formError
- `ref.listen<AuthState>(...)` — 每次 rebuild 注册新 listener，旧 listener 闭包捕获已废弃的 controller

### 2. AuthState.copyWith error 回退 bug

`copyWith` 的 `error` 参数默认值为 `null`，导致任何不显式传 `error` 的调用都会静默清除错误：
- `state.copyWith(isLoading: true)` → error 被清除（非预期）

### 3. AuthNotifier 直接用 e.toString() 作为 UI 文案

用户看到的是 Dart 异常信息（如 `SocketException: Connection refused`），不是友好的本地化文案。

## 设计方案

### 方案选择：initState + didChangeDependencies

- FormController 在 `initState()` 创建（空 schema 占位）
- `didChangeDependencies()` 检测 locale 变化 → dispose 旧 controller、创建新的
- `ref.listen` 移到 `initState()`，通过字段引用 controller
- AuthNotifier 内部映射异常为 `AuthErrorCode` 枚举，UI 层通过 `AppLocalizations` 转为文案
- 修复 `AuthState.copyWith` 的 sentinel 模式

排除方案：Riverpod Notifier 方案违反"不重写整个表单体系"约束。

### 1. FormController 生命周期

```dart
class _LoginPageState extends ConsumerState<LoginPage> {
  late FormController _formController;
  Locale? _locale;

  @override
  void initState() {
    super.initState();
    _formController = FormController(FormSchema(fields: []));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context);
    if (_locale != locale) {
      _locale = locale;
      _formController.dispose();
      _formController = _buildFormSchema(locale);
    }
  }

  FormController _buildFormSchema(Locale locale) {
    final loc = AppLocalizations.of(context)!;
    return FormController(FormSchema(fields: [
      FormFieldSchema(name: 'username', validators: [
        FormValidators.required(loc.usernameRequired),
      ]),
      FormFieldSchema(name: 'password', validators: [
        FormValidators.required(loc.passwordRequired),
      ]),
    ]));
  }

  @override
  void dispose() {
    _formController.dispose();
    super.dispose();
  }
}
```

RegisterPage 同理，confirmPassword 的 validator 引用 `_formController` 字段而非 build 局部变量。

### 2. ref.listen 生命周期

```dart
@override
void initState() {
  super.initState();
  _formController = FormController(FormSchema(fields: []));

  ref.listen<AuthState>(authStateProvider, (prev, next) {
    if (!mounted) return;
    if (next.errorCode != null) {
      _formController.setFormError(_locErrorCode(next.errorCode!));
    } else if (prev?.errorCode != null && next.errorCode == null) {
      // 新操作开始时清除旧的 formError
      _formController.setFormError(null);
    }
  });
}
```

- Riverpod 的 `ref.listen` 在 `ConsumerState` 中自动绑定 widget 生命周期
- 闭包引用 `_formController` 字段，locale 变化重建 controller 后自动指向新实例
- 不需要 `listenManual`

### 3. AuthErrorCode 枚举

```dart
enum AuthErrorCode {
  invalidCredentials,
  networkError,
  serverError,
  tooManyRequests,
  unknown,
}
```

### 4. AuthNotifier 错误映射

```dart
AuthErrorCode _mapExceptionToErrorCode(Object e) {
  if (e is SocketException || e is TimeoutException) return AuthErrorCode.networkError;
  if (e is HttpException) {
    if (e.statusCode == 401 || e.statusCode == 403) return AuthErrorCode.invalidCredentials;
    if (e.statusCode == 429) return AuthErrorCode.tooManyRequests;
    if (e.statusCode >= 500) return AuthErrorCode.serverError;
  }
  return AuthErrorCode.unknown;
}
```

login/register 中 catch 块改为：
```dart
} catch (e) {
  final errorCode = _mapExceptionToErrorCode(e);
  state = state.copyWith(isLoading: false, errorCode: errorCode);
}
```

### 5. AuthState 增加 errorCode 字段

```dart
class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,        // 保留，用于调试/日志
    this.errorCode,    // 新增：用于 UI 展示
    this.rememberMe = false,
    this.authReady = false,
    this.permissions = const [],
  });

  final String? error;
  final AuthErrorCode? errorCode;
  // ...
}
```

### 6. AuthState.copyWith sentinel 修复

```dart
static const _sentinel = Object();

AuthState copyWith({
  Object? user = _sentinel,
  bool? isAuthenticated,
  bool? isLoading,
  Object? error = _sentinel,
  Object? errorCode = _sentinel,
  bool? rememberMe,
  bool? authReady,
  List<String>? permissions,
}) {
  return AuthState(
    user: identical(user, _sentinel) ? this.user : user as User?,
    isAuthenticated: isAuthenticated ?? this.isAuthenticated,
    isLoading: isLoading ?? this.isLoading,
    error: identical(error, _sentinel) ? this.error : error as String?,
    errorCode: identical(errorCode, _sentinel) ? this.errorCode : errorCode as AuthErrorCode?,
    rememberMe: rememberMe ?? this.rememberMe,
    authReady: authReady ?? this.authReady,
    permissions: permissions ?? this.permissions,
  );
}
```

行为变化：
- `state.copyWith(isLoading: true)` → error/errorCode **保留**（修复前会被清除）
- `state.copyWith(error: null)` → error **显式清除**（行为不变）

### 7. UI 层错误码 → 本地化文案

```dart
String _locErrorCode(AuthErrorCode code) {
  final loc = AppLocalizations.of(context)!;
  switch (code) {
    case AuthErrorCode.invalidCredentials: return loc.authInvalidCredentials;
    case AuthErrorCode.networkError: return loc.authNetworkError;
    case AuthErrorCode.serverError: return loc.authServerError;
    case AuthErrorCode.tooManyRequests: return loc.authTooManyRequests;
    case AuthErrorCode.unknown: return loc.authUnknownError;
  }
}
```

i18n key（app_en.arb / app_zh.arb）：
- `authInvalidCredentials`
- `authNetworkError`
- `authServerError`
- `authTooManyRequests`
- `authUnknownError`

### 8. FormErrorBanner

保持不变。ValidatedForm 自动展示 `formError`，不在具体页面重复写错误 banner。

## 测试计划

### FormController 生命周期
- 输入用户名后触发 rebuild → 字段值不丢失
- dispose 不抛 LateInitializationError

### Auth 错误展示
- authState.errorCode 变化后 FormErrorBanner 显示对应文案
- 语言切换后 banner 文案更新

### AuthState.copyWith
- 不传 error 时保留原值
- 显式传 null 时清除

### AuthErrorCode 映射
- SocketException → networkError
- HttpException(401) → invalidCredentials
- HttpException(429) → tooManyRequests
- HttpException(500) → serverError

### 验证命令
```bash
flutter test test/features/auth
flutter test test/widgets/validated_form_test.dart
flutter analyze
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `login_page.dart` | FormController/ref.listen 移到 initState，locale 变化重建 |
| `register_page.dart` | 同上 |
| `auth_provider.dart` | 增加 errorCode 字段，copyWith sentinel 修复，错误映射 |
| `auth_error_code.dart` | 新建：AuthErrorCode 枚举 |
| `app_en.arb` | 新增 5 个 auth error i18n key |
| `app_zh.arb` | 新增 5 个 auth error i18n key |
| `app_localizations.dart` | 自动生成（新增 getter） |
| 测试文件 | 新增/更新相关测试 |

## 约束

- 不重写整个表单体系
- 不把服务端原始错误直接显示给用户
- 不在 FormValidators 内硬编码中文或英文
