# Flutter Web 表单验证体系设计

> 日期：2026-05-28
> 状态：已批准
> 方案：Schema-driven + ChangeNotifier（方案 A）

## 1. 目标

为 Flutter Web 建立类似 VeeValidate / FormKit 的轻量表单验证体系，覆盖登录、注册、资料编辑、AI 设置等所有表单。

### 当前痛点

- `Validators` 类硬编码中文错误文案，未接入 `AppLocalizations`
- 无 `touched` / `dirty` / `pending` 字段状态
- 无跨字段校验（如确认密码）
- 无 async 验证能力
- 无服务端错误映射
- 各表单各自管理 loading 状态，无统一模式
- 密码长度规则不一致（validators.dart: 8-64 vs PasswordDialog: 6-20）

### 设计决策

| 决策项 | 选择 |
|--------|------|
| 错误展示 | SnackBar（全局错误）+ 字段下方 inline（字段错误） |
| 密码长度 | 统一为 8-64 |
| 覆盖范围 | 全部表单（Login, Register, Profile, Password, Phone/Email, API Key, Group, Friend） |
| Async 验证 | 占位实现，不调后端 |
| 通用表单组件 | 新建 ValidatedFormField + ValidatedForm |
| 协议复选框 | 纳入表单验证体系 |
| Server error mapping | 状态码 + 字段映射 |

## 2. 架构概览

```
core/forms/
  form_field_state.dart    — 单字段状态（value, error, touched, dirty, pending）
  form_schema.dart         — 声明式表单定义（字段列表 + 验证器链）
  validators.dart          — 验证器工厂（required, minLength, email, ...）
  form_controller.dart     — 表单协调者（validate, submit, applyServerErrors）
  server_error_mapper.dart — 服务端响应 → 字段错误/全局错误

widgets/
  validated_form_field.dart — 通用表单字段组件
  validated_form.dart       — 表单容器 + InheritedWidget
```

依赖关系：
```
FormSchema → FormFieldSchema（纯数据）
FormController → FormSchema + FormFieldState（运行时状态）
ValidatedFormField → FormController + FormFieldState（UI 绑定）
ServerErrorMapper → FormController（错误注入）
```

## 3. 数据结构

### 3.1 FormFieldState

```dart
class FormFieldState extends ChangeNotifier {
  final String name;
  final String? initialValue;
  String _value;
  String? _error;
  bool _touched = false;
  bool _dirty = false;
  bool _pending = false;

  FormFieldState({
    required this.name,
    this.initialValue,
  }) : _value = initialValue ?? '';

  String get value => _value;
  String? get error => _error;
  bool get touched => _touched;
  bool get dirty => _dirty;
  bool get pending => _pending;
  bool get isValid => _error == null;
  bool get hasValue => _value.isNotEmpty;

  // 内部方法，由 FormController 调用
  void updateValue(String value) { ... }
  void setError(String? error) { ... }
  void touch() { ... }
  void setPending(bool pending) { ... }
  void reset() { ... }
}
```

### 3.2 FormSchema

```dart
class FormSchema {
  final List<FormFieldSchema> fields;

  const FormSchema({required this.fields});
}

class FormFieldSchema {
  final String name;
  final String type;          // 'text', 'email', 'password', 'checkbox'
  final String? initialValue;
  final List<Validator> validators;
  final Future<Validator?>? asyncValidatorFactory;

  const FormFieldSchema({
    required this.name,
    this.type = 'text',
    this.initialValue,
    this.validators = const [],
    this.asyncValidatorFactory,
  });
}
```

### 3.3 验证器签名

```dart
typedef Validator = String? Function(String? value);

// 组合多个验证器，按顺序执行，遇到第一个错误即停止
Validator composeValidators(List<Validator> validators) {
  return (value) {
    for (final validator in validators) {
      final error = validator(value);
      if (error != null) return error;
    }
    return null;
  };
}
```

## 4. FormController

```dart
class FormController extends ChangeNotifier {
  final FormSchema schema;
  final Map<String, FormFieldState> _fields = {};
  String? _formError;

  FormController(this.schema) {
    for (final field in schema.fields) {
      _fields[field.name] = FormFieldState(
        name: field.name,
        initialValue: field.initialValue,
      );
    }
  }

  FormFieldState field(String name) => _fields[name]!;
  String? get formError => _formError;
  Map<String, String> get values => _fields.map((k, v) => MapEntry(k, v.value));

  /// 验证所有字段，返回是否全部通过
  Future<bool> validate() async {
    bool valid = true;
    for (final entry in _fields.entries) {
      await _validateSingleField(entry.key);
      if (!entry.value.isValid) valid = false;
    }
    return valid;
  }

  /// 验证单个字段（onBlur / onChange 时调用）
  Future<void> validateField(String name) async {
    await _validateSingleField(name);
    notifyListeners();
  }

  /// 更新字段值
  void updateField(String name, String value) {
    final field = _fields[name]!;
    field.updateValue(value);
    // 如果已 touched，实时更新错误
    if (field.touched) {
      _runSyncValidators(name);
    }
    notifyListeners();
  }

  /// 标记字段为 touched（onBlur 时调用）
  void touchField(String name) {
    final field = _fields[name]!;
    if (!field.touched) {
      field.touch();
      _runSyncValidators(name);
      notifyListeners();
    }
  }

  /// 应用服务端错误
  void applyServerErrors(Map<String, String> fieldErrors, {String? formError}) {
    for (final entry in fieldErrors.entries) {
      if (_fields.containsKey(entry.key)) {
        _fields[entry.key]!.setError(entry.value);
      }
    }
    _formError = formError;
    notifyListeners();
  }

  /// 重置所有字段
  void reset() {
    for (final field in _fields.values) {
      field.reset();
    }
    _formError = null;
    notifyListeners();
  }

  Future<void> _validateSingleField(String name) async {
    final field = _fields[name]!;
    final fieldSchema = schema.fields.firstWhere((f) => f.name == name);

    // 先执行同步验证器
    _runSyncValidators(name);

    // 再执行异步验证器（如果有）
    if (field.isValid && fieldSchema.asyncValidatorFactory != null) {
      field.setPending(true);
      notifyListeners();
      try {
        final asyncValidator = await fieldSchema.asyncValidatorFactory!;
        final error = asyncValidator(field.value);
        field.setError(error);
      } finally {
        field.setPending(false);
        notifyListeners();
      }
    }
  }

  void _runSyncValidators(String name) {
    final field = _fields[name]!;
    final fieldSchema = schema.fields.firstWhere((f) => f.name == name);
    final composed = composeValidators(fieldSchema.validators);
    field.setError(composed(field.value));
  }
}
```

## 5. 验证器

```dart
// core/forms/validators.dart

class FormValidators {
  static Validator required(String message) {
    return (value) {
      if (value == null || value.trim().isEmpty) return message;
      return null;
    };
  }

  static Validator minLength(int min, String message) {
    return (value) {
      if (value != null && value.length < min) return message;
      return null;
    };
  }

  static Validator maxLength(int max, String message) {
    return (value) {
      if (value != null && value.length > max) return message;
      return null;
    };
  }

  static Validator pattern(RegExp regex, String message) {
    return (value) {
      if (value != null && !regex.hasMatch(value)) return message;
      return null;
    };
  }

  static Validator email(String message) {
    return pattern(RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$'), message);
  }

  static Validator passwordStrength(String message) {
    // 要求包含字母和数字
    return pattern(
      RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$'),
      message,
    );
  }

  static Validator sameAs(FormFieldState other, String message) {
    return (value) {
      if (value != other.value) return message;
      return null;
    };
  }

  static Future<Validator?> asyncUniqueUsername(String message) async {
    // 占位实现：实际应调用后端 API
    return null;
  }
}
```

## 6. UI 组件

### 6.1 ValidatedFormField

```dart
class ValidatedFormField extends StatefulWidget {
  final FormController controller;
  final String name;
  final String label;
  final IconData? icon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Widget? prefix;
  final Widget? suffix;

  const ValidatedFormField({
    super.key,
    required this.controller,
    required this.name,
    required this.label,
    this.icon,
    this.obscureText = false,
    this.keyboardType,
    this.prefix,
    this.suffix,
  });

  @override
  State<ValidatedFormField> createState() => _ValidatedFormFieldState();
}
```

行为规则：
- `onChanged` → `controller.updateField(name, value)`
- `onEditingComplete` / `onFieldSubmitted` → `controller.touchField(name)` + `controller.validateField(name)`
- 错误文本：只有 `field.touched && field.error != null` 时显示
- 如果 `field.pending`，显示 Loading indicator（在 suffix 位置）
- `obscureText` 为 true 时，suffix 位置显示切换可见性按钮

### 6.2 ValidatedForm

```dart
class ValidatedForm extends InheritedWidget {
  final FormController controller;

  const ValidatedForm({
    super.key,
    required this.controller,
    required super.child,
  });

  static FormController of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ValidatedForm>()!.controller;
  }

  @override
  bool updateShouldNotify(ValidatedForm oldWidget) {
    return controller != oldWidget.controller;
  }
}
```

### 6.3 与现有组件的关系

- `AuthFormField` → 重构为调用 `ValidatedFormField`，保留视觉样式
- Settings 页面 → 直接使用 `ValidatedFormField`
- `PasswordDialog` → 使用新表单体系，密码长度统一为 8-64

## 7. ServerErrorMapper

```dart
class ServerErrors {
  final Map<String, String> fieldErrors;
  final String? formError;

  const ServerErrors({
    this.fieldErrors = const {},
    this.formError,
  });
}

class ServerErrorMapper {
  static ServerErrors map(dynamic response, {Map<String, String>? fieldAlias}) {
    // 1. 解析 response body
    // 2. 如果有 "errors" 对象 → fieldErrors
    // 3. 如果有 "message"/"detail" → formError
    // 4. HTTP 状态码辅助：422 → 字段错误，401/403/500 → 全局错误
    // 5. fieldAlias 做字段名转换
  }
}
```

## 8. i18n

### ARB 新增 key

```json
{
  "fieldRequired": "This field is required",
  "usernameMinLength": "Username must be at least {min} characters",
  "usernameMaxLength": "Username must be no more than {max} characters",
  "usernameInvalidChars": "Username can only contain letters, numbers, and underscores",
  "emailInvalid": "Please enter a valid email address",
  "passwordMinLength": "Password must be at least {min} characters",
  "passwordMaxLength": "Password must be no more than {max} characters",
  "passwordMustContainLettersAndDigits": "Password must contain both letters and digits",
  "passwordMismatch": "Passwords do not match",
  "agreementRequired": "You must accept the agreement to continue"
}
```

## 9. 表单改造范围

### 第一批（核心）
- `LoginPage` — 使用 FormSchema + FormController + ValidatedFormField
- `RegisterPage` — 同上，含协议复选框验证、跨字段 sameAs
- `AuthFormField` — 重构为 ValidatedFormField 封装

### 第二批（设置）
- `ProfilePage` — 替换 inline validators
- `PasswordDialog` — 统一密码规则，使用新体系
- `BindPhoneDialog` / `BindEmailDialog` — 添加验证

### 第三批（其他）
- `AddApiKeyForm` — 添加验证
- `CreateGroupPage` — 添加验证
- `AddFriendPage` — 添加验证（如有需要）

## 10. 测试

### 单元测试
| 文件 | 覆盖 |
|------|------|
| `validators_test.dart` | 每个验证器的通过/失败、空值、边界值 |
| `form_field_state_test.dart` | 状态变更通知、touched/dirty/pending |
| `form_controller_test.dart` | validate()、validateField()、applyServerErrors()、reset() |
| `server_error_mapper_test.dart` | 422 字段映射、400 全局错误、fieldAlias |

### Widget 测试
| 文件 | 覆盖 |
|------|------|
| `validated_form_field_test.dart` | 输入触发、error 显示、touched 后才显示 |
| `validated_form_test.dart` | 提交验证、InheritedWidget 传递 |
| `login_page_test.dart` | 表单提交、错误展示、loading |
| `register_page_test.dart` | 四字段验证、协议验证、服务端错误 |

### 测试文件结构
```
test/
  core/forms/
    validators_test.dart
    form_field_state_test.dart
    form_controller_test.dart
    server_error_mapper_test.dart
  features/auth/presentation/
    login_page_test.dart
    register_page_test.dart
  widgets/
    validated_form_field_test.dart
    validated_form_test.dart
```

## 11. 不做的事

- 不引入第三方表单框架（formz、reactive_forms 等）
- 不做 JSON Schema → FormSchema 的动态生成（schema 仍是 Dart 代码定义）
- 不做表单布局系统（布局由各页面自行控制）
- 不做字段间依赖自动追踪（跨字段校验通过 sameAs 显式声明）
- 不做 async 验证的取消/去重（占位实现阶段不需要）
