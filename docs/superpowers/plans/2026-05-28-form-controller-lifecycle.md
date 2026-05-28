# FormController 生命周期修复 + Auth 错误映射 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 LoginPage/RegisterPage 中 FormController 生命周期问题，统一 auth 错误通过错误码 + i18n 展示，修复 AuthState.copyWith 隐含 bug。

**Architecture:** FormController 从 build() 移到 initState() + didChangeDependencies()；AuthNotifier 内部映射异常为 AuthErrorCode 枚举；UI 层通过 AppLocalizations 转为用户可见文案；AuthState.copyWith 使用 sentinel 模式区分"未传参"和"显式传 null"。

**Tech Stack:** Flutter, Riverpod (StateNotifierProvider), flutter_localizations

---

### Task 1: AuthErrorCode 枚举 + AuthState.errorCode + copyWith sentinel 修复

**Files:**
- Create: `flutter/apps/web/lib/features/auth/domain/auth_error_code.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart:5-43`
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`

- [ ] **Step 1: 创建 AuthErrorCode 枚举**

```dart
// flutter/apps/web/lib/features/auth/domain/auth_error_code.dart
enum AuthErrorCode {
  invalidCredentials,
  networkError,
  serverError,
  tooManyRequests,
  unknown,
}
```

- [ ] **Step 2: AuthState 增加 errorCode 字段 + sentinel 修复**

修改 `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`：

在文件顶部增加 import：
```dart
import 'package:im_web/features/auth/domain/auth_error_code.dart';
```

将 `AuthState` 类替换为：
```dart
class AuthState {
  static const _sentinel = Object();

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.errorCode,
    this.rememberMe = false,
    this.authReady = false,
    this.permissions = const [],
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final AuthErrorCode? errorCode;
  final bool rememberMe;
  final bool authReady;
  final List<String> permissions;

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
}
```

- [ ] **Step 3: AuthNotifier 增加错误映射**

在 `auth_provider.dart` 的 `AuthNotifier` 类中：

增加 import（文件顶部）：
```dart
import 'dart:io' show SocketException;
```

在 `AuthNotifier` 类末尾（`_connectWs` 方法之前）增加：
```dart
AuthErrorCode _mapExceptionToErrorCode(Object e) {
  if (e is SocketException) return AuthErrorCode.networkError;
  if (e is TimeoutException) return AuthErrorCode.networkError;
  final msg = e.toString().toLowerCase();
  if (msg.contains('401') || msg.contains('403') || msg.contains('unauthorized')) {
    return AuthErrorCode.invalidCredentials;
  }
  if (msg.contains('429') || msg.contains('too many')) {
    return AuthErrorCode.tooManyRequests;
  }
  if (msg.contains('500') || msg.contains('502') || msg.contains('503') || msg.contains('server')) {
    return AuthErrorCode.serverError;
  }
  if (msg.contains('network') || msg.contains('connection') || msg.contains('socket')) {
    return AuthErrorCode.networkError;
  }
  return AuthErrorCode.unknown;
}
```

修改 `login` 方法的 catch 块（约第 68-71 行）：
```dart
    } catch (e) {
      _analytics.trackEvent('login_failed', {'error_type': 'auth'});
      state = state.copyWith(
        isLoading: false,
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
```

修改 `register` 方法的 catch 块（约第 87-89 行）：
```dart
    } catch (e) {
      _analytics.trackEvent('register_failed', {'error_type': 'auth'});
      state = state.copyWith(
        isLoading: false,
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
```

- [ ] **Step 4: 添加 i18n key**

在 `flutter/apps/web/lib/l10n/app_en.arb` 末尾（`}` 之前）添加：
```json
  "authInvalidCredentials": "Invalid username or password.",
  "authNetworkError": "Network error. Please check your connection.",
  "authServerError": "Server error. Please try again later.",
  "authTooManyRequests": "Too many attempts. Please try again later.",
  "authUnknownError": "An unexpected error occurred. Please try again.",
```

在 `flutter/apps/web/lib/l10n/app_zh.arb` 末尾（`}` 之前）添加：
```json
  "authInvalidCredentials": "用户名或密码错误。",
  "authNetworkError": "网络错误，请检查网络连接。",
  "authServerError": "服务器错误，请稍后重试。",
  "authTooManyRequests": "尝试次数过多，请稍后重试。",
  "authUnknownError": "发生未知错误，请重试。",
```

- [ ] **Step 5: 生成 l10n**

Run: `cd flutter/apps/web && flutter gen-l10n`
Expected: 生成的 `app_localizations.dart` 包含新的 getter

- [ ] **Step 6: 运行现有 auth 测试确认无回归**

Run: `cd flutter/apps/web && flutter test test/features/auth/auth_provider_test.dart`
Expected: 有 1 个测试失败 —— `copyWith preserves existing values` 期望 `error` 为 null，但现在 copyWith 会保留 error

- [ ] **Step 7: 更新 copyWith 测试 + 增加 errorCode 测试**

修改 `flutter/apps/web/test/features/auth/auth_provider_test.dart`：

将 `copyWith preserves existing values` 测试（约第 185-198 行）替换为：
```dart
      test('copyWith preserves error when not explicitly passed', () {
        const state = AuthState(
          user: User(id: '1', username: 'test'),
          isAuthenticated: true,
          isLoading: false,
          error: 'some error',
        );
        final copied = state.copyWith(isLoading: true);

        expect(copied.user, state.user);
        expect(copied.isAuthenticated, state.isAuthenticated);
        expect(copied.isLoading, isTrue);
        expect(copied.error, 'some error'); // preserved via sentinel
      });

      test('copyWith clears error when explicitly passed null', () {
        const state = AuthState(error: 'old error');
        final copied = state.copyWith(error: null);
        expect(copied.error, isNull);
      });

      test('copyWith preserves errorCode when not explicitly passed', () {
        const state = AuthState(errorCode: AuthErrorCode.networkError);
        final copied = state.copyWith(isLoading: true);
        expect(copied.errorCode, AuthErrorCode.networkError);
      });

      test('copyWith clears errorCode when explicitly passed null', () {
        const state = AuthState(errorCode: AuthErrorCode.networkError);
        final copied = state.copyWith(errorCode: null);
        expect(copied.errorCode, isNull);
      });
```

在文件顶部增加 import：
```dart
import 'package:im_web/features/auth/domain/auth_error_code.dart';
```

- [ ] **Step 8: 增加 AuthErrorCode 映射测试**

在 `auth_provider_test.dart` 的 `AuthNotifier` group 末尾增加：
```dart
    group('error code mapping', () {
      test('login network error maps to networkError', () async {
        mockRepo.loginError = const SocketException('Connection refused');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login timeout maps to networkError', () async {
        mockRepo.loginError = TimeoutException('Connection timed out');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login 401 error maps to invalidCredentials', () async {
        mockRepo.loginError = Exception('HTTP 401 Unauthorized');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.invalidCredentials);
      });

      test('login 429 error maps to tooManyRequests', () async {
        mockRepo.loginError = Exception('HTTP 429 Too Many Requests');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.tooManyRequests);
      });

      test('login 500 error maps to serverError', () async {
        mockRepo.loginError = Exception('HTTP 500 Internal Server Error');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.serverError);
      });

      test('login unknown error maps to unknown', () async {
        mockRepo.loginError = Exception('Something weird');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.unknown);
      });

      test('register error maps errorCode correctly', () async {
        mockRepo.registerError = const SocketException('No internet');
        await notifier.register('user', 'e@e.com', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login success clears errorCode', () async {
        // First fail
        mockRepo.loginError = Exception('fail');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, isNotNull);

        // Then succeed
        mockRepo.loginError = null;
        mockRepo.loginResponse = const UserAuthResponse(success: true);
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, isNull);
      });
    });
```

在文件顶部增加 import（如果还没有）：
```dart
import 'dart:async';
import 'dart:io' show SocketException;
```

- [ ] **Step 9: 运行 auth 测试确认全部通过**

Run: `cd flutter/apps/web && flutter test test/features/auth/auth_provider_test.dart`
Expected: 全部 PASS

- [ ] **Step 10: Commit**

```bash
cd flutter/apps/web
git add lib/features/auth/domain/auth_error_code.dart \
        lib/features/auth/presentation/auth_provider.dart \
        lib/l10n/app_en.arb lib/l10n/app_zh.arb \
        test/features/auth/auth_provider_test.dart
git commit -m "feat(auth): add AuthErrorCode enum, fix copyWith sentinel, map errors to i18n codes"
```

---

### Task 2: LoginPage FormController 生命周期修复

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart:25-94`

- [ ] **Step 1: 重写 LoginPage 生命周期**

将 `flutter/apps/web/lib/features/auth/presentation/login_page.dart` 的 `_LoginPageState` 类修改如下：

增加 import（文件顶部）：
```dart
import 'package:im_web/features/auth/domain/auth_error_code.dart';
```

在 `_LoginPageState` 类中增加字段和方法：

将 `late FormController _formController;` 之后增加：
```dart
  Locale? _locale;
```

替换 `initState` 方法（第 35-53 行），在 `_animController.forward();` 之后、`}` 之前增加：
```dart
    _formController = FormController(FormSchema(fields: []));

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (!mounted) return;
      if (next.errorCode != null) {
        _formController.setFormError(_locErrorCode(next.errorCode!));
      } else if (prev?.errorCode != null && next.errorCode == null) {
        _formController.setFormError(null);
      }
    });
```

在 `dispose` 方法之前增加 `didChangeDependencies`：
```dart
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context);
    if (_locale != locale) {
      _locale = locale;
      _formController.dispose();
      _formController = _buildFormController();
    }
  }

  FormController _buildFormController() {
    final loc = AppLocalizations.of(context)!;
    return FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'username',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(3, loc.validationUsernameMinLength(3)),
          FormValidators.maxLength(20, loc.validationUsernameMaxLength(20)),
          FormValidators.pattern(
            RegExp(r'^[a-zA-Z0-9_]+$'),
            loc.validationUsernameInvalidChars,
          ),
        ],
      ),
      FormFieldSchema(
        name: 'password',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(8, loc.validationPasswordMinLength(8)),
          FormValidators.maxLength(64, loc.validationPasswordMaxLength(64)),
          FormValidators.passwordStrength(loc.validationPasswordStrength),
        ],
      ),
    ]));
  }

  String _locErrorCode(AuthErrorCode code) {
    final loc = AppLocalizations.of(context)!;
    switch (code) {
      case AuthErrorCode.invalidCredentials:
        return loc.authInvalidCredentials;
      case AuthErrorCode.networkError:
        return loc.authNetworkError;
      case AuthErrorCode.serverError:
        return loc.authServerError;
      case AuthErrorCode.tooManyRequests:
        return loc.authTooManyRequests;
      case AuthErrorCode.unknown:
        return loc.authUnknownError;
    }
  }
```

删除 `build` 方法中的以下代码（约第 66-94 行）：
- `_formController = FormController(FormSchema(fields: [...]))` 及其整个块
- `ref.listen<AuthState>(authStateProvider, ...)` 及其整个块

- [ ] **Step 2: 运行 flutter analyze 确认无编译错误**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/login_page.dart`
Expected: No issues found

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web
git add lib/features/auth/presentation/login_page.dart
git commit -m "fix(auth): move FormController and ref.listen out of LoginPage build()"
```

---

### Task 3: RegisterPage FormController 生命周期修复

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart:26-113`

- [ ] **Step 1: 重写 RegisterPage 生命周期**

将 `flutter/apps/web/lib/features/auth/presentation/register_page.dart` 的 `_RegisterPageState` 类修改如下：

增加 import（文件顶部）：
```dart
import 'package:im_web/features/auth/domain/auth_error_code.dart';
import 'auth_providers.dart';
```

在 `_RegisterPageState` 类中增加字段：
```dart
  Locale? _locale;
```

在 `initState` 方法的 `_controller.forward();` 之后增加：
```dart
    _formController = FormController(FormSchema(fields: []));

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (!mounted) return;
      if (next.errorCode != null) {
        _formController.setFormError(_locErrorCode(next.errorCode!));
      } else if (prev?.errorCode != null && next.errorCode == null) {
        _formController.setFormError(null);
      }
    });
```

在 `build` 方法之前增加：
```dart
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context);
    if (_locale != locale) {
      _locale = locale;
      _formController.dispose();
      _formController = _buildFormController();
    }
  }

  FormController _buildFormController() {
    final loc = AppLocalizations.of(context)!;
    return FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'username',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(3, loc.validationUsernameMinLength(3)),
          FormValidators.maxLength(20, loc.validationUsernameMaxLength(20)),
          FormValidators.pattern(
            RegExp(r'^[a-zA-Z0-9_]+$'),
            loc.validationUsernameInvalidChars,
          ),
        ],
      ),
      FormFieldSchema(
        name: 'email',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.email(loc.validationEmailInvalid),
        ],
      ),
      FormFieldSchema(
        name: 'password',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(8, loc.validationPasswordMinLength(8)),
          FormValidators.maxLength(64, loc.validationPasswordMaxLength(64)),
          FormValidators.passwordStrength(loc.validationPasswordStrength),
        ],
      ),
      FormFieldSchema(
        name: 'confirmPassword',
        validators: [
          FormValidators.required(loc.validationRequired),
          (value) {
            final pw = _formController.field('password').value;
            if (value != pw) return loc.validationPasswordMismatch;
            return null;
          },
        ],
      ),
    ]));
  }

  String _locErrorCode(AuthErrorCode code) {
    final loc = AppLocalizations.of(context)!;
    switch (code) {
      case AuthErrorCode.invalidCredentials:
        return loc.authInvalidCredentials;
      case AuthErrorCode.networkError:
        return loc.authNetworkError;
      case AuthErrorCode.serverError:
        return loc.authServerError;
      case AuthErrorCode.tooManyRequests:
        return loc.authTooManyRequests;
      case AuthErrorCode.unknown:
        return loc.authUnknownError;
    }
  }
```

删除 `build` 方法中的以下代码（约第 67-113 行）：
- `_formController = FormController(FormSchema(fields: [...]))` 及其整个块
- `ref.listen<AuthState>(authStateProvider, ...)` 及其整个块

- [ ] **Step 2: 运行 flutter analyze 确认无编译错误**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/register_page.dart`
Expected: No issues found

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web
git add lib/features/auth/presentation/register_page.dart
git commit -m "fix(auth): move FormController and ref.listen out of RegisterPage build()"
```

---

### Task 4: FormController 生命周期 widget 测试

**Files:**
- Create: `flutter/apps/web/test/features/auth/presentation/login_page_test.dart`

- [ ] **Step 1: 创建 LoginPage widget 测试**

```dart
// flutter/apps/web/test/features/auth/presentation/login_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/domain/auth_error_code.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../../../helpers/fakes.dart';

void main() {
  late FakeAuthRepository mockRepo;
  late FakeWsClientPort mockWsClient;
  late FakeHttpClientPort mockHttpClient;

  setUp(() {
    mockRepo = FakeAuthRepository();
    mockWsClient = FakeWsClientPort();
    mockHttpClient = FakeHttpClientPort();
  });

  Widget buildTestWidget({Locale locale = const Locale('en')}) {
    return ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) {
          return AuthNotifier(
            mockRepo,
            mockWsClient,
            mockHttpClient,
            NoopAnalyticsPort(),
          );
        }),
      ],
      child: MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const LoginPage(),
      ),
    );
  }

  group('LoginPage lifecycle', () {
    testWidgets('field values survive rebuild', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Enter username
      final usernameField = find.widgetWithText(TextField, 'Username');
      await tester.enterText(usernameField, 'testuser');
      await tester.pump();

      // Trigger rebuild by toggling rememberMe checkbox
      final checkbox = find.byType(Checkbox);
      await tester.tap(checkbox);
      await tester.pump();

      // Username value should be preserved
      final usernameTextField = tester.widget<TextField>(
        find.widgetWithText(TextField, 'Username'),
      );
      expect(usernameTextField.controller?.text, 'testuser');
    });

    testWidgets('dispose does not throw LateInitializationError', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Remove from tree — should not throw
      await tester.pumpWidget(const MaterialApp(home: Scaffold()));
      await tester.pumpAndSettle();
    });

    testWidgets('auth error shows FormErrorBanner', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Trigger a login failure
      mockRepo.loginError = Exception('HTTP 401 Unauthorized');

      // Enter credentials and submit
      await tester.enterText(
        find.widgetWithText(TextField, 'Username'),
        'testuser',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'password123',
      );

      // Tap login button
      final loginButton = find.widgetWithText(GradientButton, 'Login');
      await tester.tap(loginButton);
      await tester.pumpAndSettle();

      // FormErrorBanner should show with localized error
      expect(find.text('Invalid username or password.'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/features/auth/presentation/login_page_test.dart`
Expected: 全部 PASS（如果 GradientButton 或其他 widget 导入有问题，可能需要调整）

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web
git add test/features/auth/presentation/login_page_test.dart
git commit -m "test(auth): add LoginPage lifecycle and error display tests"
```

---

### Task 5: 运行完整验证

- [ ] **Step 1: 运行所有 auth 测试**

Run: `cd flutter/apps/web && flutter test test/features/auth`
Expected: 全部 PASS

- [ ] **Step 2: 运行 form widget 测试**

Run: `cd flutter/apps/web && flutter test test/widgets/validated_form_test.dart`
Expected: 全部 PASS

- [ ] **Step 3: 运行 flutter analyze**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found (or only pre-existing warnings)

- [ ] **Step 4: 运行 form_error_banner 测试**

Run: `cd flutter/apps/web && flutter test test/widgets/form_error_banner_test.dart`
Expected: 全部 PASS
