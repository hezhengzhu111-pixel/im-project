# FormErrorBanner 设计文档

> 日期：2026-05-28
> 状态：已批准
> 方案：ValidatedForm 内嵌 FormErrorBanner（方案 A）

## 1. 目标

让 `FormController.formError` 真正被表单组件消费，形成字段错误、服务端错误、全局表单错误三层一致展示。

### 当前痛点

- `FormController.formError` 被设置但从未被任何 widget 消费
- 登录/注册页使用 SnackBar 显示错误，与表单验证体系脱节
- 服务端返回的全局错误无法统一呈现

### 设计决策

| 决策项 | 选择 |
|--------|------|
| 集成方式 | ValidatedForm 自动渲染 FormErrorBanner |
| 错误位置 | 表单顶部 |
| 可关闭 | 是（带 X 按钮） |
| 样式风格 | 主题色错误条（使用 Theme.of(context).colorScheme.error） |
| i18n | 所有错误文案走 l10n |

## 2. 架构概览

```
core/forms/
  form_controller.dart     — 新增 setFormError/clearFormError 方法
  server_error_mapper.dart — 已实现，无需修改

widgets/
  validated_form.dart       — 新增自动渲染 FormErrorBanner
  validated_form_field.dart — 无需修改
  form_error_banner.dart    — 新增，显示全局表单错误
```

**数据流**：

```
Server Response
    ↓
ServerErrorMapper.map()
    ↓
FormController.applyServerErrors(fieldErrors, formError)
    ↓
FormController.notifyListeners()
    ↓
ValidatedForm._onControllerChanged()
    ↓
FormErrorBanner (ListenableBuilder 重建)
    ↓
显示 formError (可关闭)
```

## 3. 组件设计

### 3.1 FormErrorBanner

```dart
class FormErrorBanner extends StatefulWidget {
  final FormController controller;
  final bool dismissible;

  const FormErrorBanner({
    super.key,
    required this.controller,
    this.dismissible = true,
  });

  @override
  State<FormErrorBanner> createState() => _FormErrorBannerState();
}
```

**行为规则**：
- 无错误或已关闭 → 显示 `SizedBox.shrink()`
- 有错误且未关闭 → 显示错误条
- 颜色使用 `Theme.of(context).colorScheme.error`
- 关闭按钮可选（由 `dismissible` 控制）
- 新错误出现时自动显示（重置 dismissed 状态）

### 3.2 ValidatedForm 修改

```dart
class ValidatedForm extends StatefulWidget {
  final FormController controller;
  final Widget child;
  final bool showErrorBanner;

  const ValidatedForm({
    super.key,
    required this.controller,
    required this.child,
    this.showErrorBanner = true,
  });
}
```

**行为规则**：
- `showErrorBanner: true`（默认）→ 自动在 child 顶部插入 FormErrorBanner
- `showErrorBanner: false` → 不插入 banner，保持原有行为
- FormErrorBanner 通过 `ListenableBuilder` 监听 FormController

**向后兼容**：
- 现有 `ValidatedForm` 使用场景（登录/注册页）无需修改
- 如需禁用 banner，可设置 `showErrorBanner: false`

### 3.3 FormController 修改

```dart
class FormController extends ChangeNotifier {
  void setFormError(String? error) {
    _formError = error;
    notifyListeners();
  }

  void clearFormError() {
    _formError = null;
    notifyListeners();
  }

  void applyServerErrors(Map<String, String> fieldErrors,
      {String? formError}) {
    for (final entry in fieldErrors.entries) {
      if (_fields.containsKey(entry.key)) {
        _fields[entry.key]!.setError(entry.value);
      }
    }
    setFormError(formError);
  }
}
```

**新增方法**：
- `setFormError(String? error)` — 设置全局表单错误
- `clearFormError()` — 清除全局表单错误

**保留方法**：
- `applyServerErrors()` — 内部调用 `setFormError()`

## 4. 页面集成

### 4.1 LoginPage 修改

```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    _formController.setFormError(next.error);
  }
});
```

### 4.2 RegisterPage 修改

```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    _formController.setFormError(next.error);
  }
});
```

**修改要点**：
- 移除 `ScaffoldMessenger.of(context).showSnackBar()`
- 改用 `_formController.setFormError(next.error)`
- FormErrorBanner 会自动显示错误

## 5. 错误处理

### 5.1 服务端错误映射

```dart
final serverErrors = ServerErrorMapper.map(
  response,
  fieldAlias: {
    'username': 'username',
    'email': 'email',
    'password': 'password',
  },
);

_formController.applyServerErrors(
  serverErrors.fieldErrors,
  formError: serverErrors.formError,
);
```

### 5.2 错误类型

1. **字段错误** → 显示在字段下方（已实现）
2. **全局表单错误** → 显示在 FormErrorBanner
3. **服务端原始错误** → 不输出敏感信息

### 5.3 i18n 错误文案

```json
{
  "formErrorServer": "Server error. Please try again.",
  "formErrorNetwork": "Network error. Please check your connection.",
  "formErrorAuth": "Invalid username or password.",
  "formErrorRateLimit": "Too many attempts. Please try again later."
}
```

## 6. 测试

### 6.1 单元测试

| 测试文件 | 覆盖 |
|----------|------|
| `form_controller_test.dart` | setFormError、clearFormError |
| `server_error_mapper_test.dart` | 字段错误映射、全局错误映射 |

### 6.2 Widget 测试

| 测试文件 | 覆盖 |
|----------|------|
| `form_error_banner_test.dart` | 显示错误、关闭错误、新错误自动显示 |

### 6.3 测试用例

1. `setFormError` 后 UI 显示
2. `clearFormError` 后 UI 消失
3. 服务端字段错误映射到字段
4. 服务端全局错误映射到 FormErrorBanner
5. 点击关闭按钮隐藏错误
6. 新错误自动显示（重置 dismissed 状态）

## 7. 实现步骤

1. 创建 FormErrorBanner 组件
2. 修改 FormController — 新增 setFormError/clearFormError
3. 修改 ValidatedForm — 自动渲染 FormErrorBanner
4. 修改 LoginPage — 移除 SnackBar，改用 setFormError()
5. 修改 RegisterPage — 移除 SnackBar，改用 setFormError()
6. 添加 i18n 错误文案
7. 编写测试
8. 验证

## 8. 不做的事

- 不修改 validators 迁移（由其他任务处理）
- 不引入第三方表单框架
- 不输出服务端原始敏感错误详情
- 不修改 FormFieldState（字段错误展示已实现）
