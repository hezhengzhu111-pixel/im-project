# Flutter Web 登录注册页面实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Flutter Web 实现完整的登录注册页面，包含响应式布局、表单验证、动画效果和完整功能

**Architecture:** 采用 Flutter Material Design 3 原生风格，居中卡片布局 + 渐变背景，包含记住我、用户协议、完整表单验证功能

**Tech Stack:** Flutter, Dart, Riverpod, GoRouter, flutter_test

---

## 文件结构映射

```
flutter/apps/web/lib/
├── features/auth/
│   ├── presentation/
│   │   ├── login_page.dart          # 登录页面（修改）
│   │   ├── register_page.dart       # 注册页面（修改）
│   │   ├── auth_provider.dart       # 状态管理（修改）
│   │   └── widgets/
│   │       ├── auth_card.dart       # 通用卡片组件（新建）
│   │       ├── gradient_button.dart # 渐变按钮组件（新建）
│   │       ├── form_field.dart      # 表单字段组件（新建）
│   │       └── agreement_dialog.dart # 用户协议对话框（新建）
│   └── data/
│       └── auth_repository_impl.dart # 认证仓库实现（已有）
├── core/
│   ├── theme/
│   │   └── app_theme.dart           # 主题配置（已有）
│   └── utils/
│       ├── validators.dart          # 表单验证工具（新建）
│       └── responsive.dart          # 响应式工具（新建）
```

---

## Task 1: 创建响应式工具类

**Files:**
- Create: `flutter/apps/web/lib/core/utils/responsive.dart`

- [ ] **Step 1: 创建 responsive.dart 文件**

```dart
// flutter/apps/web/lib/core/utils/responsive.dart
import 'package:flutter/material.dart';

class ResponsiveLayout {
  static const double mobile = 600;
  static const double tablet = 1024;
  static const double desktop = 1440;

  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < mobile;

  static bool isTablet(BuildContext context) =>
      MediaQuery.of(context).size.width >= mobile &&
      MediaQuery.of(context).size.width < tablet;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= tablet;

  static double getMaxWidth(BuildContext context) {
    if (isMobile(context)) {
      return double.infinity;
    }
    return 400;
  }

  static double getCardElevation(BuildContext context) {
    return isMobile(context) ? 0 : 8;
  }

  static double getCardMargin(BuildContext context) {
    return isMobile(context) ? 16 : 32;
  }

  static double getCardPadding(BuildContext context) {
    return isMobile(context) ? 24 : 32;
  }
}
```

- [ ] **Step 2: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/core/utils/responsive.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/core/utils/responsive.dart
git commit -m "feat(auth): add responsive layout utility for login/register pages"
```

---

## Task 2: 创建表单验证工具类

**Files:**
- Create: `flutter/apps/web/lib/core/utils/validators.dart`

- [ ] **Step 1: 创建 validators.dart 文件**

```dart
// flutter/apps/web/lib/core/utils/validators.dart
class Validators {
  static String? validateUsername(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入用户名';
    }
    if (value.length < 3 || value.length > 20) {
      return '用户名长度在 3 到 20 个字符';
    }
    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(value)) {
      return '用户名只能包含字母、数字和下划线';
    }
    return null;
  }

  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入邮箱';
    }
    if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
      return '请输入正确的邮箱格式';
    }
    return null;
  }

  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入密码';
    }
    if (value.length < 8 || value.length > 64) {
      return '密码长度在 8 到 64 个字符';
    }
    if (!RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$').hasMatch(value)) {
      return '密码必须包含字母和数字';
    }
    return null;
  }

  static String? validateConfirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) {
      return '请确认密码';
    }
    if (value != password) {
      return '两次输入密码不一致';
    }
    return null;
  }
}
```

- [ ] **Step 2: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/core/utils/validators.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/core/utils/validators.dart
git commit -m "feat(auth): add form validators for login/register pages"
```

---

## Task 3: 创建通用卡片组件

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart`

- [ ] **Step 1: 创建 widgets 目录**

```bash
mkdir -p flutter/apps/web/lib/features/auth/presentation/widgets
```

- [ ] **Step 2: 创建 auth_card.dart 文件**

```dart
// flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart
import 'package:flutter/material.dart';
import 'package:im_web/core/utils/responsive.dart';

class AuthCard extends StatelessWidget {
  final Widget child;
  final String title;
  final String subtitle;

  const AuthCard({
    super.key,
    required this.child,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: ResponsiveLayout.getCardElevation(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      margin: EdgeInsets.all(ResponsiveLayout.getCardMargin(context)),
      child: Padding(
        padding: EdgeInsets.all(ResponsiveLayout.getCardPadding(context)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 32),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/widgets/auth_card.dart`
Expected: No issues found

- [ ] **Step 4: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart
git commit -m "feat(auth): add AuthCard widget for login/register pages"
```

---

## Task 4: 创建渐变按钮组件

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart`

- [ ] **Step 1: 创建 gradient_button.dart 文件**

```dart
// flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart
import 'package:flutter/material.dart';

class GradientButton extends StatelessWidget {
  final String text;
  final VoidCallback onPressed;
  final bool isLoading;

  const GradientButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF667eea), Color(0xFF764ba2)],
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(text, style: const TextStyle(fontSize: 16)),
      ),
    );
  }
}
```

- [ ] **Step 2: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/widgets/gradient_button.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart
git commit -m "feat(auth): add GradientButton widget for login/register pages"
```

---

## Task 5: 创建表单字段组件

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart`

- [ ] **Step 1: 创建 form_field.dart 文件**

```dart
// flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart
import 'package:flutter/material.dart';

class AuthFormField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscureText;
  final String? Function(String?) validator;

  const AuthFormField({
    super.key,
    required this.controller,
    required this.label,
    required this.icon,
    this.obscureText = false,
    required this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      validator: validator,
    );
  }
}
```

- [ ] **Step 2: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/widgets/form_field.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart
git commit -m "feat(auth): add AuthFormField widget for login/register pages"
```

---

## Task 6: 创建用户协议对话框组件

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/widgets/agreement_dialog.dart`

- [ ] **Step 1: 创建 agreement_dialog.dart 文件**

```dart
// flutter/apps/web/lib/features/auth/presentation/widgets/agreement_dialog.dart
import 'package:flutter/material.dart';

class AgreementDialog extends StatelessWidget {
  final String title;
  final String content;

  const AgreementDialog({
    super.key,
    required this.title,
    required this.content,
  });

  static void show(BuildContext context, String title, String content) {
    showDialog(
      context: context,
      builder: (context) => AgreementDialog(title: title, content: content),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Text(content),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('关闭'),
        ),
      ],
    );
  }
}

// 用户协议内容
const String userAgreementContent = '''
1. 服务条款
欢迎使用IM聊天应用。在使用本服务前，请仔细阅读并理解本协议的所有条款。

2. 用户责任
用户应当遵守相关法律法规，不得利用本服务从事违法违规活动。

3. 隐私保护
我们重视用户隐私，将按照隐私政策保护用户个人信息。

4. 服务变更
我们保留随时修改或终止服务的权利，恕不另行通知。
''';

// 隐私政策内容
const String privacyPolicyContent = '''
1. 信息收集
我们仅收集为提供服务所必需的用户信息。

2. 信息使用
收集的信息仅用于提供和改善服务，不会用于其他目的。

3. 信息保护
我们采用行业标准的安全措施保护用户信息安全。

4. 信息共享
除法律要求外，我们不会与第三方共享用户个人信息。
''';
```

- [ ] **Step 2: 运行测试验证文件创建成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/widgets/agreement_dialog.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/widgets/agreement_dialog.dart
git commit -m "feat(auth): add AgreementDialog widget for user agreement and privacy policy"
```

---

## Task 7: 更新 AuthProvider 支持完整功能

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`

- [ ] **Step 1: 更新 AuthState 添加 rememberMe 字段**

```dart
// flutter/apps/web/lib/features/auth/presentation/auth_provider.dart
class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.rememberMe = false,
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final bool rememberMe;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
    bool? rememberMe,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      rememberMe: rememberMe ?? this.rememberMe,
    );
  }
}
```

- [ ] **Step 2: 更新 AuthNotifier 的 login 方法添加 rememberMe 参数**

```dart
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient, this._httpClient)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;

  Future<void> login(String username, String password, {bool rememberMe = false}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        isAuthenticated: true,
        rememberMe: rememberMe,
      );
      _connectWs();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> register(String username, String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.register(
        RegisterRequest(
          username: username,
          password: password,
          email: email,
          nickname: username,
        ),
      );
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  // ... 其他方法保持不变
}
```

- [ ] **Step 3: 运行测试验证文件更新成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/auth_provider.dart`
Expected: No issues found

- [ ] **Step 4: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/auth_provider.dart
git commit -m "feat(auth): update AuthProvider to support rememberMe and email registration"
```

---

## Task 8: 实现登录页面

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`

- [ ] **Step 1: 重写登录页面使用新组件**

```dart
// flutter/apps/web/lib/features/auth/presentation/login_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/form_field.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _rememberMe = false;

  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _controller.forward();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF667eea), Color(0xFF764ba2)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: Center(
              child: AuthCard(
                title: '登录',
                subtitle: '请登录您的加密通信账户',
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AuthFormField(
                        controller: _usernameController,
                        label: '用户名',
                        icon: Icons.person,
                        validator: Validators.validateUsername,
                      ),
                      const SizedBox(height: 16),
                      AuthFormField(
                        controller: _passwordController,
                        label: '密码',
                        icon: Icons.lock,
                        obscureText: true,
                        validator: Validators.validatePassword,
                      ),
                      if (authState.error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          authState.error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Checkbox(
                            value: _rememberMe,
                            onChanged: (value) {
                              setState(() {
                                _rememberMe = value ?? false;
                              });
                            },
                          ),
                          const Text('记住我'),
                        ],
                      ),
                      const SizedBox(height: 24),
                      GradientButton(
                        text: '登录',
                        isLoading: authState.isLoading,
                        onPressed: _login,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => context.go('/register'),
                        child: const Text('没有账号？注册'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _login() {
    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authStateProvider.notifier).login(
            _usernameController.text.trim(),
            _passwordController.text,
            rememberMe: _rememberMe,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 2: 运行测试验证文件更新成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/login_page.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/login_page.dart
git commit -m "feat(auth): implement login page with responsive design and animations"
```

---

## Task 9: 实现注册页面

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`

- [ ] **Step 1: 重写注册页面使用新组件**

```dart
// flutter/apps/web/lib/features/auth/presentation/register_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/form_field.dart';
import 'package:im_web/features/auth/presentation/widgets/agreement_dialog.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _agreementAccepted = false;

  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _controller.forward();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF667eea), Color(0xFF764ba2)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: Center(
              child: AuthCard(
                title: '注册',
                subtitle: '创建您的账户，开始聊天之旅',
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AuthFormField(
                        controller: _usernameController,
                        label: '用户名',
                        icon: Icons.person,
                        validator: Validators.validateUsername,
                      ),
                      const SizedBox(height: 16),
                      AuthFormField(
                        controller: _emailController,
                        label: '邮箱',
                        icon: Icons.email,
                        validator: Validators.validateEmail,
                      ),
                      const SizedBox(height: 16),
                      AuthFormField(
                        controller: _passwordController,
                        label: '密码',
                        icon: Icons.lock,
                        obscureText: true,
                        validator: Validators.validatePassword,
                      ),
                      const SizedBox(height: 16),
                      AuthFormField(
                        controller: _confirmPasswordController,
                        label: '确认密码',
                        icon: Icons.lock,
                        obscureText: true,
                        validator: (v) => Validators.validateConfirmPassword(
                            v, _passwordController.text),
                      ),
                      if (authState.error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          authState.error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Checkbox(
                            value: _agreementAccepted,
                            onChanged: (value) {
                              setState(() {
                                _agreementAccepted = value ?? false;
                              });
                            },
                          ),
                          Expanded(
                            child: Wrap(
                              children: [
                                const Text('我已阅读并同意 '),
                                GestureDetector(
                                  onTap: () => AgreementDialog.show(
                                    context,
                                    '用户协议',
                                    userAgreementContent,
                                  ),
                                  child: Text(
                                    '用户协议',
                                    style: TextStyle(
                                      color: Theme.of(context).primaryColor,
                                      decoration: TextDecoration.underline,
                                    ),
                                  ),
                                ),
                                const Text(' 和 '),
                                GestureDetector(
                                  onTap: () => AgreementDialog.show(
                                    context,
                                    '隐私政策',
                                    privacyPolicyContent,
                                  ),
                                  child: Text(
                                    '隐私政策',
                                    style: TextStyle(
                                      color: Theme.of(context).primaryColor,
                                      decoration: TextDecoration.underline,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      GradientButton(
                        text: '注册',
                        isLoading: authState.isLoading,
                        onPressed: _register,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => context.go('/login'),
                        child: const Text('已有账号？登录'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _register() {
    if (!_agreementAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请阅读并同意用户协议和隐私政策')),
      );
      return;
    }

    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authStateProvider.notifier).register(
            _usernameController.text.trim(),
            _emailController.text.trim(),
            _passwordController.text,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 2: 运行测试验证文件更新成功**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/register_page.dart`
Expected: No issues found

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/lib/features/auth/presentation/register_page.dart
git commit -m "feat(auth): implement register page with responsive design and animations"
```

---

## Task 10: 编写单元测试

**Files:**
- Create: `flutter/apps/web/test/core/utils/validators_test.dart`
- Create: `flutter/apps/web/test/features/auth/presentation/login_page_test.dart`
- Create: `flutter/apps/web/test/features/auth/presentation/register_page_test.dart`

- [ ] **Step 1: 创建 validators_test.dart**

```dart
// flutter/apps/web/test/core/utils/validators_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/utils/validators.dart';

void main() {
  group('Validators', () {
    group('validateUsername', () {
      test('should return error for empty username', () {
        expect(Validators.validateUsername(null), '请输入用户名');
        expect(Validators.validateUsername(''), '请输入用户名');
      });

      test('should return error for username too short', () {
        expect(Validators.validateUsername('ab'), '用户名长度在 3 到 20 个字符');
      });

      test('should return error for username too long', () {
        expect(Validators.validateUsername('a' * 21), '用户名长度在 3 到 20 个字符');
      });

      test('should return error for invalid characters', () {
        expect(Validators.validateUsername('user@name'), '用户名只能包含字母、数字和下划线');
      });

      test('should return null for valid username', () {
        expect(Validators.validateUsername('username'), null);
        expect(Validators.validateUsername('user_name'), null);
        expect(Validators.validateUsername('user123'), null);
      });
    });

    group('validateEmail', () {
      test('should return error for empty email', () {
        expect(Validators.validateEmail(null), '请输入邮箱');
        expect(Validators.validateEmail(''), '请输入邮箱');
      });

      test('should return error for invalid email', () {
        expect(Validators.validateEmail('invalid'), '请输入正确的邮箱格式');
        expect(Validators.validateEmail('invalid@'), '请输入正确的邮箱格式');
      });

      test('should return null for valid email', () {
        expect(Validators.validateEmail('test@example.com'), null);
      });
    });

    group('validatePassword', () {
      test('should return error for empty password', () {
        expect(Validators.validatePassword(null), '请输入密码');
        expect(Validators.validatePassword(''), '请输入密码');
      });

      test('should return error for password too short', () {
        expect(Validators.validatePassword('1234567'), '密码长度在 8 到 64 个字符');
      });

      test('should return error for password without letters', () {
        expect(Validators.validatePassword('12345678'), '密码必须包含字母和数字');
      });

      test('should return error for password without numbers', () {
        expect(Validators.validatePassword('abcdefgh'), '密码必须包含字母和数字');
      });

      test('should return null for valid password', () {
        expect(Validators.validatePassword('password123'), null);
      });
    });

    group('validateConfirmPassword', () {
      test('should return error for empty confirm password', () {
        expect(Validators.validateConfirmPassword(null, 'password'), '请确认密码');
        expect(Validators.validateConfirmPassword('', 'password'), '请确认密码');
      });

      test('should return error for mismatched passwords', () {
        expect(Validators.validateConfirmPassword('different', 'password'), '两次输入密码不一致');
      });

      test('should return null for matching passwords', () {
        expect(Validators.validateConfirmPassword('password', 'password'), null);
      });
    });
  });
}
```

- [ ] **Step 2: 运行单元测试**

Run: `cd flutter/apps/web && flutter test test/core/utils/validators_test.dart`
Expected: All tests pass

- [ ] **Step 3: 提交代码**

```bash
git add flutter/apps/web/test/core/utils/validators_test.dart
git commit -m "test(auth): add unit tests for form validators"
```

---

## Task 11: 编写 Widget 测试

**Files:**
- Create: `flutter/apps/web/test/features/auth/presentation/widgets/auth_card_test.dart`
- Create: `flutter/apps/web/test/features/auth/presentation/widgets/gradient_button_test.dart`

- [ ] **Step 1: 创建 auth_card_test.dart**

```dart
// flutter/apps/web/test/features/auth/presentation/widgets/auth_card_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';

void main() {
  group('AuthCard', () {
    testWidgets('should display title and subtitle', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AuthCard(
              title: 'Test Title',
              subtitle: 'Test Subtitle',
              child: const Text('Child Content'),
            ),
          ),
        ),
      );

      expect(find.text('Test Title'), findsOneWidget);
      expect(find.text('Test Subtitle'), findsOneWidget);
      expect(find.text('Child Content'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: 创建 gradient_button_test.dart**

```dart
// flutter/apps/web/test/features/auth/presentation/widgets/gradient_button_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';

void main() {
  group('GradientButton', () {
    testWidgets('should display text when not loading', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GradientButton(
              text: 'Login',
              onPressed: () {},
            ),
          ),
        ),
      );

      expect(find.text('Login'), findsOneWidget);
    });

    testWidgets('should show loading indicator when loading', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GradientButton(
              text: 'Login',
              isLoading: true,
              onPressed: () {},
            ),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: 运行 Widget 测试**

Run: `cd flutter/apps/web && flutter test test/features/auth/presentation/widgets/`
Expected: All tests pass

- [ ] **Step 4: 提交代码**

```bash
git add flutter/apps/web/test/features/auth/presentation/widgets/
git commit -m "test(auth): add widget tests for AuthCard and GradientButton"
```

---

## Task 12: 集成测试

**Files:**
- Create: `flutter/apps/web/integration_test/auth_test.dart`

- [ ] **Step 1: 创建集成测试文件**

```dart
// flutter/apps/web/integration_test/auth_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Authentication Flow', () {
    testWidgets('should navigate from login to register', (tester) async {
      // TODO: Implement integration test
      // This requires backend server running
    });

    testWidgets('should validate form fields', (tester) async {
      // TODO: Implement integration test
      // This requires backend server running
    });
  });
}
```

- [ ] **Step 2: 提交代码**

```bash
git add flutter/apps/web/integration_test/auth_test.dart
git commit -m "test(auth): add integration test scaffolding for authentication flow"
```

---

## 完成检查清单

- [ ] 响应式工具类已创建并测试
- [ ] 表单验证工具类已创建并测试
- [ ] AuthCard 组件已创建并测试
- [ ] GradientButton 组件已创建并测试
- [ ] AuthFormField 组件已创建
- [ ] AgreementDialog 组件已创建
- [ ] AuthProvider 已更新支持完整功能
- [ ] 登录页面已实现完整功能
- [ ] 注册页面已实现完整功能
- [ ] 单元测试通过
- [ ] Widget 测试通过
- [ ] 集成测试框架已搭建

---

## 执行选项

计划已保存到 `docs/superpowers/plans/2026-05-27-flutter-web-auth.md`。两种执行方式：

**1. Subagent-Driven（推荐）** - 每个任务派发一个独立子代理，任务间进行代码审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

选择哪种方式？
