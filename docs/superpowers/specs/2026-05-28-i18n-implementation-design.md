# Flutter Web 国际化实现设计

## 概述

实现Flutter Web应用的完整国际化功能，包括语言切换、主题切换、文案本地化和持久化存储。

## 目标

1. 让MaterialApp.router绑定locale、supportedLocales、localizationsDelegates、themeMode
2. languageProvider改为可持久化状态，默认读取浏览器语言
3. themeModeProvider同步修复，设置页切换主题后MaterialApp生效
4. 将硬编码文案迁移到arb文件
5. 实现fallback策略：未知语言回zh
6. 添加简单测试验证语言切换功能

## 架构设计

### 核心组件

1. **LanguageProvider** - 管理语言状态，从localStorage读取初始值
2. **ThemeModeProvider** - 管理主题状态，从localStorage读取初始值
3. **App组件** - 监听provider变化，更新MaterialApp.router的locale/themeMode
4. **SettingsPage** - 切换语言/主题时更新provider

### 数据流

```
启动流程：
1. 从localStorage读取语言设置 → 初始化LanguageProvider
2. 从localStorage读取主题设置 → 初始化ThemeModeProvider
3. App组件监听provider变化 → 更新MaterialApp.router

用户切换流程：
1. 用户在SettingsPage切换语言/主题
2. 更新对应的provider
3. SettingsPage手动保存到localStorage
4. App组件监听到变化 → 更新MaterialApp.router
5. 所有使用AppLocalizations的组件自动获取新语言
```

## 组件设计

### 1. LanguageProvider

**位置**: `flutter/apps/web/lib/core/di/providers.dart`

**实现**:
```dart
// 从localStorage读取初始语言
String _getInitialLanguage() {
  try {
    final saved = window.localStorage['app_language'];
    if (saved != null && (saved == 'en' || saved == 'zh')) {
      return saved;
    }
  } catch (_) {}
  
  // 读取浏览器语言
  final browserLang = window.navigator.language;
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('en')) return 'en';
  
  // fallback到中文
  return 'zh';
}

final languageProvider = StateProvider<String>((ref) => _getInitialLanguage());
```

### 2. ThemeModeProvider

**位置**: `flutter/apps/web/lib/core/di/providers.dart`

**实现**:
```dart
// 从localStorage读取初始主题
ThemeMode _getInitialThemeMode() {
  try {
    final saved = window.localStorage['app_theme_mode'];
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

### 3. App组件

**位置**: `flutter/apps/web/lib/app.dart`

**修改**:
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

### 4. SettingsPage修改

**位置**: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart`

**语言切换**:
```dart
SegmentedControl<String>(
  segments: [
    Segment(label: '中文', value: 'zh'),
    Segment(label: 'English', value: 'en'),
  ],
  value: ref.watch(languageProvider),
  onChanged: (value) {
    ref.read(languageProvider.notifier).state = value;
    window.localStorage['app_language'] = value;
  },
),
```

**主题切换**:
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
    window.localStorage['app_theme_mode'] = value.name;
  },
),
```

## 文案迁移设计

### 需要迁移的页面

1. **LoginPage** - 登录表单、按钮、链接文案
2. **RegisterPage** - 注册表单、按钮、协议文案
3. **MobileShell** - 底部导航标签
4. **ChatPage** - 搜索框、空状态、消息计数
5. **MessageInput** - 输入框提示、附件菜单
6. **Validators** - 表单验证错误消息

### 新增翻译键

**LoginPage相关**:
- `loginSubtitle`: "请登录您的加密通信账户"
- `loginRememberMe`: "记住我"
- `loginNoAccountRegister`: "没有账号？注册"

**RegisterPage相关**:
- `registerTitle`: "注册"
- `registerSubtitle`: "创建您的账户，开始聊天之旅"
- `registerEmail`: "邮箱"
- `registerConfirmPassword`: "确认密码"
- `registerAgreementPrefix`: "我已阅读并同意 "
- `registerAgreementSuffix`: " 和 "
- `registerUserAgreement`: "用户协议"
- `registerPrivacyPolicy`: "隐私政策"
- `registerButton`: "注册"
- `registerHasAccountLogin`: "已有账号？登录"
- `registerAgreementRequired`: "请阅读并同意用户协议和隐私政策"

**ChatPage相关**:
- `chatSelectSession`: "选择一个会话开始聊天"
- `chatSearchHint`: "搜索会话..."
- `chatMessageCount`: "{count} 条消息"
- `chatMemberCount`: "{count} 人"
- `chatImageSending`: "图片发送功能开发中..."
- `chatFileSending`: "文件发送功能开发中..."

**MessageInput相关**:
- `chatInputHint`: "输入消息..."
- `chatAttach`: "附件"
- `chatImage`: "图片"
- `chatFile`: "文件"
- `chatVoice`: "语音"

**Validators相关**:
- `validatorUsernameRequired`: "请输入用户名"
- `validatorUsernameLength`: "用户名长度在 3 到 20 个字符"
- `validatorUsernameFormat`: "用户名只能包含字母、数字和下划线"
- `validatorEmailRequired`: "请输入邮箱"
- `validatorEmailFormat`: "请输入正确的邮箱格式"
- `validatorPasswordRequired`: "请输入密码"
- `validatorPasswordLength`: "密码长度在 8 到 64 个字符"
- `validatorPasswordFormat`: "密码必须包含字母和数字"
- `validatorConfirmPasswordRequired`: "请确认密码"
- `validatorPasswordMismatch`: "两次输入密码不一致"

### Validators修改

**位置**: `flutter/apps/web/lib/core/utils/validators.dart`

**修改方案**: Validators需要接受AppLocalizations参数

```dart
class Validators {
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
  
  // 其他验证方法类似...
}
```

**调用方式修改**:
```dart
AuthFormField(
  controller: _usernameController,
  label: loc.loginUsername,
  icon: Icons.person,
  validator: (v) => Validators.validateUsername(v, loc),
),
```

## 测试设计

### 测试用例

1. **语言切换测试**
   - 测试切换到英文后，LoginPage的关键文案是否变为英文
   - 测试切换到中文后，LoginPage的关键文案是否变为中文

2. **导航标签测试**
   - 测试切换语言后，MobileShell的导航标签是否正确变化

3. **聊天页面测试**
   - 测试切换语言后，ChatPage的搜索框提示、空状态文案是否正确变化

### 测试实现

使用Flutter的widget_test.dart，模拟语言切换并验证文案变化。

## 技术约束

1. 使用Flutter官方gen-l10n
2. 维护.l10n.yaml配置文件
3. 不直接编辑生成文件，优先维护.arb
4. 使用dart:html的localStorage进行持久化
5. Fallback策略：未知语言回zh

## 实现步骤

1. 创建l10n.yaml配置文件（如果不存在）
2. 修改providers.dart，创建可持久化的languageProvider和themeModeProvider
3. 修改app.dart，绑定locale和themeMode
4. 修改settings_page.dart，切换语言/主题时保存到localStorage
5. 将硬编码文案迁移到arb文件
6. 修改validators.dart，接受AppLocalizations参数
7. 修改各个页面，使用AppLocalizations获取文案
8. 添加测试用例
9. 运行flutter gen-l10n生成本地化文件
10. 测试验证功能

## 风险评估

1. **localStorage访问失败** - 使用try-catch处理，fallback到默认值
2. **浏览器语言检测失败** - 使用默认语言zh
3. **arb文件缺少翻译** - 使用fallback语言
4. **组件未正确监听provider** - 确保所有组件都使用ref.watch

## 成功标准

1. MaterialApp.router正确绑定locale和themeMode
2. 语言切换后界面立即更新
3. 主题切换后界面立即更新
4. 刷新页面后设置保留
5. 浏览器语言检测正常工作
6. 所有硬编码文案都已迁移到arb文件
7. 表单验证错误消息已本地化
8. 测试用例通过