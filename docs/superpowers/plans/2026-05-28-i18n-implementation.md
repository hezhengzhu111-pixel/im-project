# Flutter Web 国际化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现Flutter Web应用的完整国际化功能，包括语言切换、主题切换、文案本地化和持久化存储

**Architecture:** 使用Riverpod StateProvider管理语言和主题状态，通过localStorage持久化，App组件监听状态变化并更新MaterialApp.router的locale和themeMode

**Tech Stack:** Flutter, Dart, Riverpod, dart:html, flutter_localizations, gen-l10n

---

## 文件结构

### 需要创建的文件
- 无

### 需要修改的文件
- `flutter/apps/web/lib/core/di/providers.dart` - 修改languageProvider和themeModeProvider，添加localStorage持久化
- `flutter/apps/web/lib/app.dart` - 绑定locale和themeMode到MaterialApp.router
- `flutter/apps/web/lib/features/settings/presentation/settings_page.dart` - 切换语言/主题时保存到localStorage
- `flutter/apps/web/lib/l10n/app_en.arb` - 添加缺失的翻译键
- `flutter/apps/web/lib/l10n/app_zh.arb` - 添加缺失的翻译键
- `flutter/apps/web/lib/core/utils/validators.dart` - 修改接受AppLocalizations参数
- `flutter/apps/web/lib/features/auth/presentation/login_page.dart` - 使用AppLocalizations获取文案
- `flutter/apps/web/lib/features/auth/presentation/register_page.dart` - 使用AppLocalizations获取文案
- `flutter/apps/web/lib/core/responsive/mobile_shell.dart` - 使用AppLocalizations获取导航标签
- `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` - 使用AppLocalizations获取文案
- `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` - 使用AppLocalizations获取文案
- `flutter/apps/web/test/core/utils/validators_test.dart` - 更新测试以使用AppLocalizations

### 测试文件
- `flutter/apps/web/test/features/i18n/language_switch_test.dart` - 新增语言切换测试
- `flutter/apps/web/test/features/i18n/theme_switch_test.dart` - 新增主题切换测试

---

## Task 1: 修改providers.dart，添加localStorage持久化

**Files:**
- Modify: `flutter/apps/web/lib/core/di/providers.dart:147-151`

- [ ] **Step 1: 添加dart:html导入**

```dart
import 'dart:html' as html;
```

- [ ] **Step 2: 修改languageProvider，从localStorage读取初始值**

```dart
// 从localStorage读取初始语言
String _getInitialLanguage() {
  try {
    final saved = html.window.localStorage['app_language'];
    if (saved != null && (saved == 'en' || saved == 'zh')) {
      return saved;
    }
  } catch (_) {}
  
  // 读取浏览器语言
  final browserLang = html.window.navigator.language;
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('en')) return 'en';
  
  // fallback到中文
  return 'zh';
}

final languageProvider = StateProvider<String>((ref) => _getInitialLanguage());
```

- [ ] **Step 3: 修改themeModeProvider，从localStorage读取初始值**

```dart
// 从localStorage读取初始主题
ThemeMode _getInitialThemeMode() {
  try {
    final saved = html.window.localStorage['app_theme_mode'];
    if (saved != null) {
      switch (saved) {
        case 'light': return ThemeMode.light;
        case 'dark': return ThemeMode.dark;
        case 'system': return ThemeMode.system;
      }
    }
  } catch (_) {}
  return ThemeMode.system;
}

final themeModeProvider = StateProvider<ThemeMode>((ref) => _getInitialThemeMode());
```

- [ ] **Step 4: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 5: 提交更改**

```bash
git add flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(i18n): add localStorage persistence for language and theme providers"
```

---

## Task 2: 修改app.dart，绑定locale和themeMode

**Files:**
- Modify: `flutter/apps/web/lib/app.dart:27-37`

- [ ] **Step 1: 修改build方法，监听languageProvider和themeModeProvider**

```dart
@override
Widget build(BuildContext context) {
  final router = ref.watch(routerProvider);
  final locale = ref.watch(languageProvider);
  final themeMode = ref.watch(themeModeProvider);

  return MaterialApp.router(
    title: 'IM',
    theme: AppTheme.lightTheme,
    darkTheme: AppTheme.darkTheme,
    themeMode: themeMode,
    locale: Locale(locale),
    routerConfig: router,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
  );
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 3: 提交更改**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "feat(i18n): bind locale and themeMode to MaterialApp.router"
```

---

## Task 3: 修改settings_page.dart，切换时保存到localStorage

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart:216-243`

- [ ] **Step 1: 添加dart:html导入**

```dart
import 'dart:html' as html;
```

- [ ] **Step 2: 修改语言切换逻辑，保存到localStorage**

```dart
SegmentedControl<String>(
  segments: [
    Segment(label: '中文', value: 'zh'),
    Segment(label: 'English', value: 'en'),
  ],
  value: ref.watch(languageProvider),
  onChanged: (value) {
    ref.read(languageProvider.notifier).state = value;
    html.window.localStorage['app_language'] = value;
  },
),
```

- [ ] **Step 3: 修改主题切换逻辑，保存到localStorage**

```dart
SegmentedControl<ThemeMode>(
  segments: [
    Segment(label: loc.settingsThemeLight, value: ThemeMode.light),
    Segment(label: loc.settingsThemeDark, value: ThemeMode.dark),
    Segment(label: loc.settingsThemeAuto, value: ThemeMode.system),
  ],
  value: ref.watch(themeModeProvider),
  onChanged: (value) {
    ref.read(themeModeProvider.notifier).state = value;
    html.window.localStorage['app_theme_mode'] = value.name;
  },
),
```

- [ ] **Step 4: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 5: 提交更改**

```bash
git add flutter/apps/web/lib/features/settings/presentation/settings_page.dart
git commit -m "feat(i18n): save language and theme settings to localStorage"
```

---

## Task 4: 更新arb文件，添加缺失的翻译键

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`

- [ ] **Step 1: 在app_en.arb中添加LoginPage相关翻译键**

```json
"loginSubtitle": "Please log in to your encrypted communication account",
"loginRememberMe": "Remember me",
"loginNoAccountRegister": "No account? Register",
```

- [ ] **Step 2: 在app_en.arb中添加RegisterPage相关翻译键**

```json
"registerTitle": "Register",
"registerSubtitle": "Create your account and start chatting",
"registerEmail": "Email",
"registerConfirmPassword": "Confirm password",
"registerAgreementPrefix": "I have read and agree to the ",
"registerAgreementSuffix": " and ",
"registerUserAgreement": "User Agreement",
"registerPrivacyPolicy": "Privacy Policy",
"registerButton": "Register",
"registerHasAccountLogin": "Already have an account? Login",
"registerAgreementRequired": "Please read and agree to the User Agreement and Privacy Policy",
```

- [ ] **Step 3: 在app_en.arb中添加ChatPage相关翻译键**

```json
"chatSelectSession": "Select a conversation to start chatting",
"chatSearchHint": "Search conversations...",
"chatMessageCount": "{count} messages",
"chatMemberCount": "{count} members",
"chatImageSending": "Image sending feature under development...",
"chatFileSending": "File sending feature under development...",
```

- [ ] **Step 4: 在app_en.arb中添加MessageInput相关翻译键**

```json
"chatInputHint": "Type a message...",
"chatAttach": "Attach",
"chatImage": "Image",
"chatFile": "File",
"chatVoice": "Voice",
```

- [ ] **Step 5: 在app_en.arb中添加Validators相关翻译键**

```json
"validatorUsernameRequired": "Please enter a username",
"validatorUsernameLength": "Username must be 3-20 characters",
"validatorUsernameFormat": "Username can only contain letters, numbers, and underscores",
"validatorEmailRequired": "Please enter an email",
"validatorEmailFormat": "Please enter a valid email format",
"validatorPasswordRequired": "Please enter a password",
"validatorPasswordLength": "Password must be 8-64 characters",
"validatorPasswordFormat": "Password must contain letters and numbers",
"validatorConfirmPasswordRequired": "Please confirm your password",
"validatorPasswordMismatch": "Passwords do not match",
```

- [ ] **Step 6: 在app_zh.arb中添加对应的中文翻译**

```json
"loginSubtitle": "请登录您的加密通信账户",
"loginRememberMe": "记住我",
"loginNoAccountRegister": "没有账号？注册",
"registerTitle": "注册",
"registerSubtitle": "创建您的账户，开始聊天之旅",
"registerEmail": "邮箱",
"registerConfirmPassword": "确认密码",
"registerAgreementPrefix": "我已阅读并同意 ",
"registerAgreementSuffix": " 和 ",
"registerUserAgreement": "用户协议",
"registerPrivacyPolicy": "隐私政策",
"registerButton": "注册",
"registerHasAccountLogin": "已有账号？登录",
"registerAgreementRequired": "请阅读并同意用户协议和隐私政策",
"chatSelectSession": "选择一个会话开始聊天",
"chatSearchHint": "搜索会话...",
"chatMessageCount": "{count} 条消息",
"chatMemberCount": "{count} 人",
"chatImageSending": "图片发送功能开发中...",
"chatFileSending": "文件发送功能开发中...",
"chatInputHint": "输入消息...",
"chatAttach": "附件",
"chatImage": "图片",
"chatFile": "文件",
"chatVoice": "语音",
"validatorUsernameRequired": "请输入用户名",
"validatorUsernameLength": "用户名长度在 3 到 20 个字符",
"validatorUsernameFormat": "用户名只能包含字母、数字和下划线",
"validatorEmailRequired": "请输入邮箱",
"validatorEmailFormat": "请输入正确的邮箱格式",
"validatorPasswordRequired": "请输入密码",
"validatorPasswordLength": "密码长度在 8 到 64 个字符",
"validatorPasswordFormat": "密码必须包含字母和数字",
"validatorConfirmPasswordRequired": "请确认密码",
"validatorPasswordMismatch": "两次输入密码不一致",
```

- [ ] **Step 7: 运行flutter gen-l10n生成本地化文件**

Run: `cd flutter/apps/web && flutter gen-l10n`
Expected: 生成新的app_localizations.dart文件

- [ ] **Step 8: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 9: 提交更改**

```bash
git add flutter/apps/web/lib/l10n/app_en.arb flutter/apps/web/lib/l10n/app_zh.arb
git commit -m "feat(i18n): add missing translation keys for login, register, chat, and validators"
```

---

## Task 5: 修改validators.dart，接受AppLocalizations参数

**Files:**
- Modify: `flutter/apps/web/lib/core/utils/validators.dart:1-47`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 修改validateUsername方法，接受AppLocalizations参数**

```dart
static String? validateUsername(String? value, AppLocalizations loc) {
  if (value == null || value.isEmpty) {
    return loc.validatorUsernameRequired;
  }
  if (value.length < 3 || value.length > 20) {
    return loc.validatorUsernameLength;
  }
  if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(value)) {
    return loc.validatorUsernameFormat;
  }
  return null;
}
```

- [ ] **Step 3: 修改validateEmail方法，接受AppLocalizations参数**

```dart
static String? validateEmail(String? value, AppLocalizations loc) {
  if (value == null || value.isEmpty) {
    return loc.validatorEmailRequired;
  }
  if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
    return loc.validatorEmailFormat;
  }
  return null;
}
```

- [ ] **Step 4: 修改validatePassword方法，接受AppLocalizations参数**

```dart
static String? validatePassword(String? value, AppLocalizations loc) {
  if (value == null || value.isEmpty) {
    return loc.validatorPasswordRequired;
  }
  if (value.length < 8 || value.length > 64) {
    return loc.validatorPasswordLength;
  }
  if (!RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$').hasMatch(value)) {
    return loc.validatorPasswordFormat;
  }
  return null;
}
```

- [ ] **Step 5: 修改validateConfirmPassword方法，接受AppLocalizations参数**

```dart
static String? validateConfirmPassword(String? value, String password, AppLocalizations loc) {
  if (value == null || value.isEmpty) {
    return loc.validatorConfirmPasswordRequired;
  }
  if (value != password) {
    return loc.validatorPasswordMismatch;
  }
  return null;
}
```

- [ ] **Step 6: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 7: 提交更改**

```bash
git add flutter/apps/web/lib/core/utils/validators.dart
git commit -m "feat(i18n): modify validators to accept AppLocalizations parameter"
```

---

## Task 6: 修改login_page.dart，使用AppLocalizations获取文案

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart:60-212`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 在build方法中获取loc**

```dart
@override
Widget build(BuildContext context) {
  final authState = ref.watch(authStateProvider);
  final loc = AppLocalizations.of(context)!;
  
  // ... 其余代码
}
```

- [ ] **Step 3: 修改_buildMobileLayout方法，使用loc获取文案**

```dart
Widget _buildMobileLayout(AuthState authState, AppLocalizations loc) {
  return Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: AuthCard(
        title: loc.loginTitle,
        subtitle: loc.loginSubtitle,
        child: _buildForm(authState, loc),
      ),
    ),
  );
}
```

- [ ] **Step 4: 修改_buildDesktopLayout方法，使用loc获取文案**

```dart
Widget _buildDesktopLayout(AuthState authState, AppLocalizations loc) {
  return Row(
    children: [
      const Expanded(
        child: BrandShowcase(),
      ),
      Expanded(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(40),
            child: AuthCard(
              title: loc.loginTitle,
              subtitle: loc.loginSubtitle,
              child: _buildForm(authState, loc),
            ),
          ),
        ),
      ),
    ],
  );
}
```

- [ ] **Step 5: 修改_buildForm方法，使用loc获取文案**

```dart
Widget _buildForm(AuthState authState, AppLocalizations loc) {
  return Form(
    key: _formKey,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AuthFormField(
          controller: _usernameController,
          label: loc.loginUsername,
          icon: Icons.person,
          validator: (v) => Validators.validateUsername(v, loc),
        ),
        const SizedBox(height: 16),
        AuthFormField(
          controller: _passwordController,
          label: loc.loginPassword,
          icon: Icons.lock,
          obscureText: true,
          validator: (v) => Validators.validatePassword(v, loc),
        ),
        // ... 其余代码
        const SizedBox(height: 16),
        Row(
          children: [
            // ... checkbox代码
            const SizedBox(width: 8),
            Text(
              loc.loginRememberMe,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ),
        const SizedBox(height: 24),
        GradientButton(
          text: loc.loginButton,
          isLoading: authState.isLoading,
          onPressed: _login,
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => context.go('/register'),
          child: Text(loc.loginNoAccountRegister),
        ),
      ],
    ),
  );
}
```

- [ ] **Step 6: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 7: 提交更改**

```bash
git add flutter/apps/web/lib/features/auth/presentation/login_page.dart
git commit -m "feat(i18n): use AppLocalizations in LoginPage"
```

---

## Task 7: 修改register_page.dart，使用AppLocalizations获取文案

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart:62-270`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 在build方法中获取loc**

```dart
@override
Widget build(BuildContext context) {
  final authState = ref.watch(authStateProvider);
  final loc = AppLocalizations.of(context)!;
  
  // ... 其余代码
}
```

- [ ] **Step 3: 修改_buildMobileLayout方法，使用loc获取文案**

```dart
Widget _buildMobileLayout(AuthState authState, AppLocalizations loc) {
  return Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: AuthCard(
        title: loc.registerTitle,
        subtitle: loc.registerSubtitle,
        child: _buildForm(authState, loc),
      ),
    ),
  );
}
```

- [ ] **Step 4: 修改_buildDesktopLayout方法，使用loc获取文案**

```dart
Widget _buildDesktopLayout(AuthState authState, AppLocalizations loc) {
  return Row(
    children: [
      const Expanded(
        child: BrandShowcase(),
      ),
      Expanded(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(40),
            child: AuthCard(
              title: loc.registerTitle,
              subtitle: loc.registerSubtitle,
              child: _buildForm(authState, loc),
            ),
          ),
        ),
      ),
    ],
  );
}
```

- [ ] **Step 5: 修改_buildForm方法，使用loc获取文案**

```dart
Widget _buildForm(AuthState authState, AppLocalizations loc) {
  return Form(
    key: _formKey,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AuthFormField(
          controller: _usernameController,
          label: loc.loginUsername,
          icon: Icons.person,
          validator: (v) => Validators.validateUsername(v, loc),
        ),
        const SizedBox(height: 16),
        AuthFormField(
          controller: _emailController,
          label: loc.registerEmail,
          icon: Icons.email,
          validator: (v) => Validators.validateEmail(v, loc),
        ),
        const SizedBox(height: 16),
        AuthFormField(
          controller: _passwordController,
          label: loc.loginPassword,
          icon: Icons.lock,
          obscureText: true,
          validator: (v) => Validators.validatePassword(v, loc),
        ),
        const SizedBox(height: 16),
        AuthFormField(
          controller: _confirmPasswordController,
          label: loc.registerConfirmPassword,
          icon: Icons.lock,
          obscureText: true,
          validator: (v) => Validators.validateConfirmPassword(
              v, _passwordController.text, loc),
        ),
        // ... 其余代码
        const SizedBox(height: 16),
        Row(
          children: [
            // ... checkbox代码
            const SizedBox(width: 8),
            Expanded(
              child: Wrap(
                children: [
                  Text(
                    loc.registerAgreementPrefix,
                    style: const TextStyle(fontSize: 14),
                  ),
                  GestureDetector(
                    onTap: () => AgreementDialog.show(
                      context,
                      loc.registerUserAgreement,
                      userAgreementContent,
                    ),
                    child: Text(
                      loc.registerUserAgreement,
                      style: const TextStyle(
                        color: Color(0xFF667eea),
                        fontSize: 14,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                  Text(
                    loc.registerAgreementSuffix,
                    style: const TextStyle(fontSize: 14),
                  ),
                  GestureDetector(
                    onTap: () => AgreementDialog.show(
                      context,
                      loc.registerPrivacyPolicy,
                      privacyPolicyContent,
                    ),
                    child: Text(
                      loc.registerPrivacyPolicy,
                      style: const TextStyle(
                        color: Color(0xFF667eea),
                        fontSize: 14,
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
          text: loc.registerButton,
          isLoading: authState.isLoading,
          onPressed: _register,
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => context.go('/login'),
          child: Text(loc.registerHasAccountLogin),
        ),
      ],
    ),
  );
}
```

- [ ] **Step 6: 修改_register方法，使用loc获取SnackBar文案**

```dart
void _register() {
  final loc = AppLocalizations.of(context)!;
  
  if (!_agreementAccepted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(loc.registerAgreementRequired)),
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
```

- [ ] **Step 7: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 8: 提交更改**

```bash
git add flutter/apps/web/lib/features/auth/presentation/register_page.dart
git commit -m "feat(i18n): use AppLocalizations in RegisterPage"
```

---

## Task 8: 修改mobile_shell.dart，使用AppLocalizations获取导航标签

**Files:**
- Modify: `flutter/apps/web/lib/core/responsive/mobile_shell.dart:1-47`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 修改build方法，使用loc获取导航标签**

```dart
@override
Widget build(BuildContext context) {
  final location = GoRouterState.of(context).uri.toString();
  final currentIndex = _indexFromLocation(location);
  final loc = AppLocalizations.of(context)!;

  return Scaffold(
    body: child,
    bottomNavigationBar: NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: (index) => _onTap(context, index),
      destinations: [
        NavigationDestination(icon: const Icon(Icons.chat_bubble_outline), selectedIcon: const Icon(Icons.chat_bubble), label: loc.navChat),
        NavigationDestination(icon: const Icon(Icons.contacts_outlined), selectedIcon: const Icon(Icons.contacts), label: loc.navContacts),
        NavigationDestination(icon: const Icon(Icons.group_outlined), selectedIcon: const Icon(Icons.group), label: loc.navGroups),
        NavigationDestination(icon: const Icon(Icons.photo_library_outlined), selectedIcon: const Icon(Icons.photo_library), label: loc.navMoments),
        NavigationDestination(icon: const Icon(Icons.settings_outlined), selectedIcon: const Icon(Icons.settings), label: loc.navSettings),
      ],
    ),
  );
}
```

- [ ] **Step 3: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 4: 提交更改**

```bash
git add flutter/apps/web/lib/core/responsive/mobile_shell.dart
git commit -m "feat(i18n): use AppLocalizations in MobileShell"
```

---

## Task 9: 修改chat_page.dart，使用AppLocalizations获取文案

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart:1-303`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 在build方法中获取loc**

```dart
@override
Widget build(BuildContext context) {
  final chatState = ref.watch(chatStateProvider);
  final activeId = chatState.activeSessionId;
  final sessions = chatState.sessions.where((s) {
    if (_searchQuery.isEmpty) return true;
    return s.targetName.toLowerCase().contains(_searchQuery.toLowerCase());
  }).toList();

  final isMobile =
      getScreenSize(MediaQuery.of(context).size.width) == ScreenSize.mobile;
  final loc = AppLocalizations.of(context)!;

  if (isMobile) {
    return _buildMobileLayout(chatState, activeId, sessions, loc);
  }
  return _buildDesktopLayout(chatState, activeId, sessions, loc);
}
```

- [ ] **Step 3: 修改_buildDesktopLayout方法，使用loc获取文案**

```dart
Widget _buildDesktopLayout(
    dynamic chatState, String? activeId, List<dynamic> sessions, AppLocalizations loc) {
  return Row(
    children: [
      SizedBox(
        width: 320,
        child: _buildSessionList(sessions, activeId, loc),
      ),
      const VerticalDivider(thickness: 1, width: 1),
      Expanded(
        child: activeId == null
            ? Center(child: Text(loc.chatSelectSession))
            : _buildChatView(activeId, loc),
      ),
    ],
  );
}
```

- [ ] **Step 4: 修改_buildSessionList方法，使用loc获取文案**

```dart
Widget _buildSessionList(List<dynamic> sessions, String? activeId, AppLocalizations loc) {
  return Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: loc.chatSearchHint,
            prefixIcon: const Icon(Icons.search, size: 20),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 10,
            ),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _searchQuery = v),
        ),
      ),
      Expanded(
        child: ref.watch(chatStateProvider).isLoading
            ? const Center(child: CircularProgressIndicator())
            : sessions.isEmpty
                ? Center(child: Text(loc.chatNoSessions))
                : ListView.builder(
                    itemCount: sessions.length,
                    itemBuilder: (context, index) {
                      final session = sessions[index];
                      return SessionTile(
                        session: session,
                        isSelected: session.id == activeId,
                        onTap: () {
                          ref
                              .read(chatStateProvider.notifier)
                              .setActiveSession(session.id);
                          final isGroup =
                              session.conversationType == 'group' ||
                                  session.type == 'group';
                          if (isGroup) {
                            ref
                                .read(chatStateProvider.notifier)
                                .loadGroupMessages(session.targetId);
                          } else {
                            ref
                                .read(chatStateProvider.notifier)
                                .loadMessages(session.targetId);
                          }
                        },
                      );
                    },
                  ),
      ),
    ],
  );
}
```

- [ ] **Step 5: 修改_buildChatView方法，使用loc获取文案**

```dart
Widget _buildChatView(String sessionId, AppLocalizations loc) {
  // ... 原有代码
  
  return Column(
    children: [
      // ... NetworkStatusBanner
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Theme.of(context).dividerColor),
          ),
        ),
        child: Row(
          children: [
            // ... back button
            Text(
              sessionName,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            if (isGroup && memberCount != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primaryContainer
                      .withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  loc.chatMemberCount({'count': memberCount}),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                ),
              ),
            ],
            const Spacer(),
            if (messages.isNotEmpty)
              Text(
                loc.chatMessageCount({'count': messages.length}),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
          ],
        ),
      ),
      // ... E2EE banner
      Expanded(
        child: messages.isEmpty
            ? Center(child: Text(loc.noData))
            : ListView.builder(
                // ... 原有代码
              ),
      ),
      MessageInput(
        onSend: (text) {
          // ... 原有代码
        },
        onSendImage: (_) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(loc.chatImageSending)),
          );
        },
        onSendFile: (_) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(loc.chatFileSending)),
          );
        },
      ),
    ],
  );
}
```

- [ ] **Step 6: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 7: 提交更改**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(i18n): use AppLocalizations in ChatPage"
```

---

## Task 10: 修改message_input.dart，使用AppLocalizations获取文案

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart:1-125`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 修改_showAttachmentMenu方法，使用loc获取文案**

```dart
void _showAttachmentMenu() {
  final loc = AppLocalizations.of(context)!;
  
  showModalBottomSheet(
    context: context,
    builder: (context) => SafeArea(
      child: Wrap(
        children: [
          ListTile(
            leading: const Icon(Icons.image),
            title: Text(loc.chatImage),
            onTap: () {
              Navigator.pop(context);
              _pickAndSendImage();
            },
          ),
          ListTile(
            leading: const Icon(Icons.attach_file),
            title: Text(loc.chatFile),
            onTap: () {
              Navigator.pop(context);
              _pickAndSendFile();
            },
          ),
        ],
      ),
    ),
  );
}
```

- [ ] **Step 3: 修改build方法，使用loc获取tooltip和hintText**

```dart
@override
Widget build(BuildContext context) {
  final loc = AppLocalizations.of(context)!;
  
  return Container(
    padding: const EdgeInsets.all(8.0),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      border: Border(
        top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
    ),
    child: Row(
      children: [
        const OutboxIndicator(),
        IconButton(
          icon: const Icon(Icons.add_circle_outline),
          onPressed: _showAttachmentMenu,
          tooltip: loc.chatAttach,
        ),
        IconButton(
          icon: Icon(_isRecording ? Icons.stop : Icons.mic),
          onPressed: () {
            setState(() => _isRecording = !_isRecording);
          },
          tooltip: loc.chatVoice,
          color: _isRecording ? Colors.red : null,
        ),
        Expanded(
          child: TextField(
            controller: _controller,
            decoration: InputDecoration(
              hintText: loc.chatInputHint,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            ),
            minLines: 1,
            maxLines: 4,
            onSubmitted: (_) => _handleSend(),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.send),
          onPressed: _handleSend,
          color: Theme.of(context).colorScheme.primary,
        ),
      ],
    ),
  );
}
```

- [ ] **Step 4: 运行测试验证**

Run: `cd flutter/apps/web && flutter test`
Expected: 测试应该通过

- [ ] **Step 5: 提交更改**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(i18n): use AppLocalizations in MessageInput"
```

---

## Task 11: 更新validators_test.dart，使用AppLocalizations

**Files:**
- Modify: `flutter/apps/web/test/core/utils/validators_test.dart:1-85`

- [ ] **Step 1: 添加AppLocalizations导入**

```dart
import 'package:im_web/l10n/app_localizations.dart';
```

- [ ] **Step 2: 创建测试用的AppLocalizations实例**

```dart
void main() {
  final loc = AppLocalizations.delegate.build(const Locale('zh'));
  
  group('Validators', () {
    // ... 测试代码
  });
}
```

- [ ] **Step 3: 更新所有测试用例，传入loc参数**

```dart
group('validateUsername', () {
  test('should return error for empty username', () {
    expect(Validators.validateUsername(null, loc), loc.validatorUsernameRequired);
    expect(Validators.validateUsername('', loc), loc.validatorUsernameRequired);
  });

  test('should return error for username too short', () {
    expect(Validators.validateUsername('ab', loc), loc.validatorUsernameLength);
  });

  test('should return error for username too long', () {
    expect(Validators.validateUsername('a' * 21, loc), loc.validatorUsernameLength);
  });

  test('should return error for invalid characters', () {
    expect(Validators.validateUsername('user@name', loc), loc.validatorUsernameFormat);
  });

  test('should return null for valid username', () {
    expect(Validators.validateUsername('username', loc), null);
    expect(Validators.validateUsername('user_name', loc), null);
    expect(Validators.validateUsername('user123', loc), null);
  });
});

group('validateEmail', () {
  test('should return error for empty email', () {
    expect(Validators.validateEmail(null, loc), loc.validatorEmailRequired);
    expect(Validators.validateEmail('', loc), loc.validatorEmailRequired);
  });

  test('should return error for invalid email', () {
    expect(Validators.validateEmail('invalid', loc), loc.validatorEmailFormat);
    expect(Validators.validateEmail('invalid@', loc), loc.validatorEmailFormat);
  });

  test('should return null for valid email', () {
    expect(Validators.validateEmail('test@example.com', loc), null);
  });
});

group('validatePassword', () {
  test('should return error for empty password', () {
    expect(Validators.validatePassword(null, loc), loc.validatorPasswordRequired);
    expect(Validators.validatePassword('', loc), loc.validatorPasswordRequired);
  });

  test('should return error for password too short', () {
    expect(Validators.validatePassword('1234567', loc), loc.validatorPasswordLength);
  });

  test('should return error for password without letters', () {
    expect(Validators.validatePassword('12345678', loc), loc.validatorPasswordFormat);
  });

  test('should return error for password without numbers', () {
    expect(Validators.validatePassword('abcdefgh', loc), loc.validatorPasswordFormat);
  });

  test('should return null for valid password', () {
    expect(Validators.validatePassword('password123', loc), null);
  });
});

group('validateConfirmPassword', () {
  test('should return error for empty confirm password', () {
    expect(Validators.validateConfirmPassword(null, 'password', loc), loc.validatorConfirmPasswordRequired);
    expect(Validators.validateConfirmPassword('', 'password', loc), loc.validatorConfirmPasswordRequired);
  });

  test('should return error for mismatched passwords', () {
    expect(Validators.validateConfirmPassword('different', 'password', loc), loc.validatorPasswordMismatch);
  });

  test('should return null for matching passwords', () {
    expect(Validators.validateConfirmPassword('password', 'password', loc), null);
  });
});
```

- [ ] **Step 4: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/core/utils/validators_test.dart`
Expected: 测试应该通过

- [ ] **Step 5: 提交更改**

```bash
git add flutter/apps/web/test/core/utils/validators_test.dart
git commit -m "test(i18n): update validators_test to use AppLocalizations"
```

---

## Task 12: 添加语言切换测试

**Files:**
- Create: `flutter/apps/web/test/features/i18n/language_switch_test.dart`

- [ ] **Step 1: 创建测试文件**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  group('Language Switch', () {
    testWidgets('should switch login page text from Chinese to English', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            languageProvider.overrideWithValue('zh'),
          ],
          child: const MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: LoginPage(),
          ),
        ),
      );

      // Verify Chinese text is displayed
      expect(find.text('登录'), findsOneWidget);
      expect(find.text('请登录您的加密通信账户'), findsOneWidget);

      // Switch to English
      final container = ProviderScope.containerOf(find.byType(LoginPage));
      container.read(languageProvider.notifier).state = 'en';
      await tester.pumpAndSettle();

      // Verify English text is displayed
      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Please log in to your encrypted communication account'), findsOneWidget);
    });

    testWidgets('should switch login page text from English to Chinese', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            languageProvider.overrideWithValue('en'),
          ],
          child: const MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: LoginPage(),
          ),
        ),
      );

      // Verify English text is displayed
      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Please log in to your encrypted communication account'), findsOneWidget);

      // Switch to Chinese
      final container = ProviderScope.containerOf(find.byType(LoginPage));
      container.read(languageProvider.notifier).state = 'zh';
      await tester.pumpAndSettle();

      // Verify Chinese text is displayed
      expect(find.text('登录'), findsOneWidget);
      expect(find.text('请登录您的加密通信账户'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/features/i18n/language_switch_test.dart`
Expected: 测试应该通过

- [ ] **Step 3: 提交更改**

```bash
git add flutter/apps/web/test/features/i18n/language_switch_test.dart
git commit -m "test(i18n): add language switch test for LoginPage"
```

---

## Task 13: 添加主题切换测试

**Files:**
- Create: `flutter/apps/web/test/features/i18n/theme_switch_test.dart`

- [ ] **Step 1: 创建测试文件**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/app.dart';

void main() {
  group('Theme Switch', () {
    testWidgets('should switch from light to dark theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            themeModeProvider.overrideWithValue(ThemeMode.light),
          ],
          child: const App(),
        ),
      );

      // Verify light theme is applied
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.themeMode, ThemeMode.light);

      // Switch to dark theme
      final container = ProviderScope.containerOf(find.byType(App));
      container.read(themeModeProvider.notifier).state = ThemeMode.dark;
      await tester.pumpAndSettle();

      // Verify dark theme is applied
      final updatedMaterialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(updatedMaterialApp.themeMode, ThemeMode.dark);
    });

    testWidgets('should switch from dark to system theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            themeModeProvider.overrideWithValue(ThemeMode.dark),
          ],
          child: const App(),
        ),
      );

      // Verify dark theme is applied
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.themeMode, ThemeMode.dark);

      // Switch to system theme
      final container = ProviderScope.containerOf(find.byType(App));
      container.read(themeModeProvider.notifier).state = ThemeMode.system;
      await tester.pumpAndSettle();

      // Verify system theme is applied
      final updatedMaterialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(updatedMaterialApp.themeMode, ThemeMode.system);
    });
  });
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/features/i18n/theme_switch_test.dart`
Expected: 测试应该通过

- [ ] **Step 3: 提交更改**

```bash
git add flutter/apps/web/test/features/i18n/theme_switch_test.dart
git commit -m "test(i18n): add theme switch test for App"
```

---

## Task 14: 运行所有测试，确保一切正常

**Files:**
- Test: `flutter/apps/web/test/`

- [ ] **Step 1: 运行所有测试**

Run: `cd flutter/apps/web && flutter test`
Expected: 所有测试应该通过

- [ ] **Step 2: 检查测试覆盖率**

Run: `cd flutter/apps/web && flutter test --coverage`
Expected: 测试覆盖率应该有所提高

- [ ] **Step 3: 最终提交**

```bash
git add .
git commit -m "chore(i18n): complete internationalization implementation"
```

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-05-28-i18n-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 我为每个任务调度一个新的子代理，任务之间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中使用executing-plans执行任务，批量执行并设置检查点

请选择执行方式。