# Flutter Form Validation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight form validation system (Schema-driven + ChangeNotifier) with field states, i18n, server error mapping, and reusable UI components for all Flutter Web forms.

**Architecture:** `FormSchema` declares fields and validator chains. `FormFieldState` (ChangeNotifier) tracks value/error/touched/dirty/pending per field. `FormController` orchestrates validation and server error injection. `ValidatedFormField` / `ValidatedForm` widgets bind UI to controller state. All error messages go through `AppLocalizations`.

**Tech Stack:** Flutter, Dart, Riverpod (state management), flutter_localizations (i18n)

---

## File Structure

```
lib/core/forms/
  form_field_state.dart          — Field state (value, error, touched, dirty, pending)
  form_schema.dart               — Schema + FieldSchema data classes
  validators.dart                — Validator factory functions
  form_controller.dart           — Orchestrates validation across all fields
  server_error_mapper.dart       — Maps server responses to field/form errors
  validators.dart (new)          — Composable validators (replaces core/utils/validators.dart)

lib/widgets/
  validated_form_field.dart      — Generic form field widget with error display
  validated_form.dart            — InheritedWidget wrapper for FormController

lib/l10n/app_en.arb              — Add validation error keys
lib/l10n/app_zh.arb              — Add validation error keys

lib/features/auth/presentation/
  login_page.dart                — Refactor to use FormSchema + FormController
  register_page.dart             — Refactor to use FormSchema + FormController
  widgets/form_field.dart        — Refactor AuthFormField to wrap ValidatedFormField

lib/features/settings/presentation/
  profile_page.dart              — Refactor to use FormSchema + FormController
  widgets/password_dialog.dart   — Refactor to use FormSchema + FormController

test/core/forms/
  validators_test.dart           — Unit tests for all validators
  form_field_state_test.dart     — Unit tests for field state
  form_controller_test.dart      — Unit tests for controller
  server_error_mapper_test.dart  — Unit tests for error mapping

test/widgets/
  validated_form_field_test.dart — Widget tests for form field
  validated_form_test.dart       — Widget tests for form container
```

---

### Task 1: Add i18n keys for validation errors

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`

- [ ] **Step 1: Add English validation error keys**

Append to `app_en.arb` before the closing `}`:

```json
  "validationRequired": "This field is required",
  "validationUsernameMinLength": "Username must be at least {min} characters",
  "validationUsernameMaxLength": "Username must be no more than {max} characters",
  "validationUsernameInvalidChars": "Username can only contain letters, numbers, and underscores",
  "validationEmailInvalid": "Please enter a valid email address",
  "validationPasswordMinLength": "Password must be at least {min} characters",
  "validationPasswordMaxLength": "Password must be no more than {max} characters",
  "validationPasswordStrength": "Password must contain both letters and digits",
  "validationPasswordMismatch": "Passwords do not match",
  "validationAgreementRequired": "You must accept the agreement to continue",
  "validationNicknameRequired": "Please enter a nickname",
  "validationNicknameMaxLength": "Nickname must be no more than {max} characters"
```

- [ ] **Step 2: Add Chinese validation error keys**

Append to `app_zh.arb` before the closing `}`:

```json
  "validationRequired": "此项为必填项",
  "validationUsernameMinLength": "用户名长度至少为 {min} 个字符",
  "validationUsernameMaxLength": "用户名长度不能超过 {max} 个字符",
  "validationUsernameInvalidChars": "用户名只能包含字母、数字和下划线",
  "validationEmailInvalid": "请输入正确的邮箱格式",
  "validationPasswordMinLength": "密码长度至少为 {min} 个字符",
  "validationPasswordMaxLength": "密码长度不能超过 {max} 个字符",
  "validationPasswordStrength": "密码必须包含字母和数字",
  "validationPasswordMismatch": "两次输入的密码不一致",
  "validationAgreementRequired": "请阅读并同意用户协议和隐私政策",
  "validationNicknameRequired": "请输入昵称",
  "validationNicknameMaxLength": "昵称长度不能超过 {max} 个字符"
```

- [ ] **Step 3: Generate localizations**

Run: `cd flutter/apps/web && flutter gen-l10n`

Expected: Generates `app_localizations.dart` with new getter methods like `validationRequired`, `validationUsernameMinLength(int min)`, etc.

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add lib/l10n/app_en.arb lib/l10n/app_zh.arb lib/l10n/app_localizations.dart lib/l10n/app_localizations_en.dart lib/l10n/app_localizations_zh.dart
git commit -m "feat(forms): add i18n keys for validation errors"
```

---

### Task 2: Create FormFieldState

**Files:**
- Create: `flutter/apps/web/lib/core/forms/form_field_state.dart`
- Create: `flutter/apps/web/test/core/forms/form_field_state_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/core/forms/form_field_state_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_field_state.dart';

void main() {
  group('FormFieldState', () {
    test('initializes with default value', () {
      final field = FormFieldState(name: 'username');
      expect(field.value, '');
      expect(field.error, isNull);
      expect(field.touched, isFalse);
      expect(field.dirty, isFalse);
      expect(field.pending, isFalse);
      expect(field.isValid, isTrue);
      expect(field.hasValue, isFalse);
    });

    test('initializes with initial value', () {
      final field = FormFieldState(name: 'username', initialValue: 'hello');
      expect(field.value, 'hello');
      expect(field.hasValue, isTrue);
    });

    test('updateValue changes value and sets dirty', () {
      final field = FormFieldState(name: 'username');
      field.updateValue('new');
      expect(field.value, 'new');
      expect(field.dirty, isTrue);
    });

    test('updateValue with same value does not set dirty', () {
      final field = FormFieldState(name: 'username', initialValue: 'same');
      field.updateValue('same');
      expect(field.dirty, isFalse);
    });

    test('setError sets error', () {
      final field = FormFieldState(name: 'username');
      field.setError('required');
      expect(field.error, 'required');
      expect(field.isValid, isFalse);
    });

    test('setError with null clears error', () {
      final field = FormFieldState(name: 'username');
      field.setError('required');
      field.setError(null);
      expect(field.error, isNull);
      expect(field.isValid, isTrue);
    });

    test('touch sets touched', () {
      final field = FormFieldState(name: 'username');
      field.touch();
      expect(field.touched, isTrue);
    });

    test('setPending sets pending', () {
      final field = FormFieldState(name: 'username');
      field.setPending(true);
      expect(field.pending, isTrue);
      field.setPending(false);
      expect(field.pending, isFalse);
    });

    test('reset clears all state', () {
      final field = FormFieldState(name: 'username', initialValue: 'init');
      field.updateValue('changed');
      field.setError('err');
      field.touch();
      field.setPending(true);
      field.reset();
      expect(field.value, 'init');
      expect(field.error, isNull);
      expect(field.touched, isFalse);
      expect(field.dirty, isFalse);
      expect(field.pending, isFalse);
    });

    test('notifies listeners on updateValue', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.updateValue('new');
      expect(notified, isTrue);
    });

    test('notifies listeners on setError', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.setError('err');
      expect(notified, isTrue);
    });

    test('notifies listeners on touch', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.touch();
      expect(notified, isTrue);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/forms/form_field_state_test.dart`
Expected: FAIL — cannot find `form_field_state.dart`

- [ ] **Step 3: Implement FormFieldState**

```dart
// flutter/apps/web/lib/core/forms/form_field_state.dart
import 'package:flutter/foundation.dart';

class FormFieldState extends ChangeNotifier {
  final String name;
  final String? _initialValue;
  String _value;
  String? _error;
  bool _touched = false;
  bool _dirty = false;
  bool _pending = false;

  FormFieldState({
    required this.name,
    String? initialValue,
  })  : _initialValue = initialValue,
        _value = initialValue ?? '';

  String get value => _value;
  String? get error => _error;
  bool get touched => _touched;
  bool get dirty => _dirty;
  bool get pending => _pending;
  bool get isValid => _error == null;
  bool get hasValue => _value.isNotEmpty;

  void updateValue(String value) {
    if (_value == value) return;
    _value = value;
    _dirty = true;
    notifyListeners();
  }

  void setError(String? error) {
    _error = error;
    notifyListeners();
  }

  void touch() {
    _touched = true;
    notifyListeners();
  }

  void setPending(bool pending) {
    _pending = pending;
    notifyListeners();
  }

  void reset() {
    _value = _initialValue ?? '';
    _error = null;
    _touched = false;
    _dirty = false;
    _pending = false;
    notifyListeners();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/forms/form_field_state_test.dart`
Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
cd flutter/apps/web && git add lib/core/forms/form_field_state.dart test/core/forms/form_field_state_test.dart
git commit -m "feat(forms): add FormFieldState with value, error, touched, dirty, pending"
```

---

### Task 3: Create FormSchema

**Files:**
- Create: `flutter/apps/web/lib/core/forms/form_schema.dart`

- [ ] **Step 1: Create FormSchema**

This is a pure data class with no behavior to test separately — it will be exercised through FormController tests.

```dart
// flutter/apps/web/lib/core/forms/form_schema.dart

typedef Validator = String? Function(String? value);

/// Combines multiple validators into one. Runs sequentially, stops at first error.
Validator composeValidators(List<Validator> validators) {
  return (String? value) {
    for (final validator in validators) {
      final error = validator(value);
      if (error != null) return error;
    }
    return null;
  };
}

class FormFieldSchema {
  final String name;
  final String type;
  final String? initialValue;
  final List<Validator> validators;
  final Future<Validator?> Function()? asyncValidatorFactory;

  const FormFieldSchema({
    required this.name,
    this.type = 'text',
    this.initialValue,
    this.validators = const [],
    this.asyncValidatorFactory,
  });
}

class FormSchema {
  final List<FormFieldSchema> fields;

  const FormSchema({required this.fields});
}
```

- [ ] **Step 2: Commit**

```bash
cd flutter/apps/web && git add lib/core/forms/form_schema.dart
git commit -m "feat(forms): add FormSchema and FormFieldSchema data classes"
```

---

### Task 4: Create FormValidators

**Files:**
- Create: `flutter/apps/web/lib/core/forms/validators.dart`
- Create: `flutter/apps/web/test/core/forms/validators_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/core/forms/validators_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/core/forms/form_field_state.dart';

void main() {
  group('FormValidators', () {
    group('required', () {
      test('returns error for null', () {
        expect(FormValidators.required('required')(null), 'required');
      });

      test('returns error for empty string', () {
        expect(FormValidators.required('required')(''), 'required');
      });

      test('returns error for whitespace only', () {
        expect(FormValidators.required('required')('   '), 'required');
      });

      test('returns null for valid value', () {
        expect(FormValidators.required('required')('hello'), isNull);
      });
    });

    group('minLength', () {
      test('returns error for short value', () {
        expect(FormValidators.minLength(3, 'too short')('ab'), 'too short');
      });

      test('returns null for value at min length', () {
        expect(FormValidators.minLength(3, 'too short')('abc'), isNull);
      });

      test('returns null for null value', () {
        expect(FormValidators.minLength(3, 'too short')(null), isNull);
      });
    });

    group('maxLength', () {
      test('returns error for long value', () {
        expect(FormValidators.maxLength(5, 'too long')('abcdef'), 'too long');
      });

      test('returns null for value at max length', () {
        expect(FormValidators.maxLength(5, 'too long')('abcde'), isNull);
      });

      test('returns null for null value', () {
        expect(FormValidators.maxLength(5, 'too long')(null), isNull);
      });
    });

    group('pattern', () {
      test('returns error for non-matching value', () {
        final validator = FormValidators.pattern(RegExp(r'^\d+$'), 'digits only');
        expect(validator('abc'), 'digits only');
      });

      test('returns null for matching value', () {
        final validator = FormValidators.pattern(RegExp(r'^\d+$'), 'digits only');
        expect(validator('123'), isNull);
      });
    });

    group('email', () {
      test('returns error for invalid email', () {
        expect(FormValidators.email('invalid')('not-email'), 'invalid');
      });

      test('returns null for valid email', () {
        expect(FormValidators.email('invalid')('test@example.com'), isNull);
      });
    });

    group('passwordStrength', () {
      test('returns error for digits only', () {
        expect(FormValidators.passwordStrength('weak')('12345678'), 'weak');
      });

      test('returns error for letters only', () {
        expect(FormValidators.passwordStrength('weak')('abcdefgh'), 'weak');
      });

      test('returns null for letters and digits', () {
        expect(FormValidators.passwordStrength('weak')('abc12345'), isNull);
      });
    });

    group('sameAs', () {
      test('returns error when values differ', () {
        final other = FormFieldState(name: 'password', initialValue: 'pass1');
        expect(FormValidators.sameAs(other, 'mismatch')('pass2'), 'mismatch');
      });

      test('returns null when values match', () {
        final other = FormFieldState(name: 'password', initialValue: 'pass1');
        expect(FormValidators.sameAs(other, 'mismatch')('pass1'), isNull);
      });
    });

    group('asyncUniqueUsername', () {
      test('returns null (placeholder)', () async {
        final validator = await FormValidators.asyncUniqueUsername('taken');
        expect(validator, isNull);
      });
    });
  });

  group('composeValidators', () {
    test('returns null when all validators pass', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
      ]);
      expect(composed('hello'), isNull);
    });

    test('returns first error encountered', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
      ]);
      expect(composed(null), 'required');
    });

    test('stops at first error', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
        FormValidators.maxLength(5, 'long'),
      ]);
      expect(composed('ab'), 'short');
    });

    test('returns null for empty validator list', () {
      final composed = composeValidators([]);
      expect(composed('anything'), isNull);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/forms/validators_test.dart`
Expected: FAIL — cannot find `validators.dart`

- [ ] **Step 3: Implement FormValidators**

```dart
// flutter/apps/web/lib/core/forms/validators.dart
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/form_field_state.dart';

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
    // Placeholder: in production, call backend API
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/forms/validators_test.dart`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd flutter/apps/web && git add lib/core/forms/validators.dart lib/core/forms/form_schema.dart test/core/forms/validators_test.dart
git commit -m "feat(forms): add composable FormValidators with TDD"
```

---

### Task 5: Create FormController

**Files:**
- Create: `flutter/apps/web/lib/core/forms/form_controller.dart`
- Create: `flutter/apps/web/test/core/forms/form_controller_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/core/forms/form_controller_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';

void main() {
  FormSchema _testSchema() => FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [
            FormValidators.required('required'),
            FormValidators.minLength(3, 'min 3'),
          ],
        ),
        FormFieldSchema(
          name: 'email',
          validators: [
            FormValidators.required('required'),
            FormValidators.email('invalid email'),
          ],
        ),
      ]);

  group('FormController', () {
    test('creates fields from schema', () {
      final controller = FormController(_testSchema());
      expect(controller.field('username').value, '');
      expect(controller.field('email').value, '');
    });

    test('values returns current field values', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'john');
      expect(controller.values, {'username': 'john', 'email': ''});
    });

    test('validate returns true when all fields valid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'john');
      controller.updateField('email', 'test@example.com');
      expect(await controller.validate(), isTrue);
    });

    test('validate returns false when any field invalid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab'); // too short
      expect(await controller.validate(), isFalse);
      expect(controller.field('username').error, 'min 3');
    });

    test('validateField validates single field', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      await controller.validateField('username');
      expect(controller.field('username').error, 'min 3');
    });

    test('validateField clears error when valid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      await controller.validateField('username');
      expect(controller.field('username').error, 'min 3');
      controller.updateField('username', 'abc');
      await controller.validateField('username');
      expect(controller.field('username').error, isNull);
    });

    test('updateField runs validators when touched', () async {
      final controller = FormController(_testSchema());
      controller.touchField('username');
      controller.updateField('username', 'ab');
      expect(controller.field('username').error, 'min 3');
    });

    test('updateField does not run validators when not touched', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      expect(controller.field('username').error, isNull);
    });

    test('touchField marks field as touched', () {
      final controller = FormController(_testSchema());
      controller.touchField('username');
      expect(controller.field('username').touched, isTrue);
    });

    test('touchField runs validators', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', '');
      controller.touchField('username');
      expect(controller.field('username').error, 'required');
    });

    test('applyServerErrors sets field errors', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({'email': 'already taken'});
      expect(controller.field('email').error, 'already taken');
    });

    test('applyServerErrors sets formError for unknown fields', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({}, formError: 'network error');
      expect(controller.formError, 'network error');
    });

    test('applyServerErrors ignores unknown field names', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({'unknown': 'error'});
      expect(controller.field('username').error, isNull);
    });

    test('reset clears all fields and formError', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      controller.touchField('username');
      await controller.validateField('username');
      controller.applyServerErrors({}, formError: 'err');
      controller.reset();
      expect(controller.field('username').value, '');
      expect(controller.field('username').error, isNull);
      expect(controller.field('username').touched, isFalse);
      expect(controller.formError, isNull);
    });

    test('notifies listeners on updateField', () {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      controller.updateField('username', 'new');
      expect(notified, isTrue);
    });

    test('notifies listeners on validateField', () async {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      await controller.validateField('username');
      expect(notified, isTrue);
    });

    test('notifies listeners on applyServerErrors', () {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      controller.applyServerErrors({'username': 'taken'});
      expect(notified, isTrue);
    });

    test('formError is null by default', () {
      final controller = FormController(_testSchema());
      expect(controller.formError, isNull);
    });

    test('validate runs async validator when sync passes', () async {
      final completer = Completer<String?>();
      final schema = FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [FormValidators.required('required')],
          asyncValidatorFactory: () async => completer.future,
        ),
      ]);
      final controller = FormController(schema);
      controller.updateField('username', 'john');

      // Start validation but don't await yet
      final future = controller.validate();

      // Should be pending
      expect(controller.field('username').pending, isTrue);

      // Complete async validator
      completer.complete(null);
      await future;

      expect(controller.field('username').pending, isFalse);
      expect(controller.field('username').error, isNull);
    });

    test('validate skips async validator when sync fails', () async {
      final schema = FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [FormValidators.required('required')],
          asyncValidatorFactory: () async => (value) => 'async error',
        ),
      ]);
      final controller = FormController(schema);
      // username is empty, sync validator fails
      await controller.validate();
      expect(controller.field('username').error, 'required');
      expect(controller.field('username').pending, isFalse);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/forms/form_controller_test.dart`
Expected: FAIL — cannot find `form_controller.dart`

- [ ] **Step 3: Implement FormController**

```dart
// flutter/apps/web/lib/core/forms/form_controller.dart
import 'package:flutter/foundation.dart';
import 'package:im_web/core/forms/form_field_state.dart';
import 'package:im_web/core/forms/form_schema.dart';

class FormController extends ChangeNotifier {
  final FormSchema schema;
  final Map<String, FormFieldState> _fields = {};
  String? _formError;

  FormController(this.schema) {
    for (final fieldSchema in schema.fields) {
      _fields[fieldSchema.name] = FormFieldState(
        name: fieldSchema.name,
        initialValue: fieldSchema.initialValue,
      );
    }
  }

  FormFieldState field(String name) => _fields[name]!;
  String? get formError => _formError;
  Map<String, String> get values =>
      _fields.map((k, v) => MapEntry(k, v.value));

  Future<bool> validate() async {
    bool valid = true;
    for (final entry in _fields.entries) {
      await _validateSingleField(entry.key);
      if (!entry.value.isValid) valid = false;
    }
    return valid;
  }

  Future<void> validateField(String name) async {
    await _validateSingleField(name);
    notifyListeners();
  }

  void updateField(String name, String value) {
    final field = _fields[name]!;
    field.updateValue(value);
    if (field.touched) {
      _runSyncValidators(name);
    }
    notifyListeners();
  }

  void touchField(String name) {
    final field = _fields[name]!;
    if (!field.touched) {
      field.touch();
      _runSyncValidators(name);
      notifyListeners();
    }
  }

  void applyServerErrors(Map<String, String> fieldErrors,
      {String? formError}) {
    for (final entry in fieldErrors.entries) {
      if (_fields.containsKey(entry.key)) {
        _fields[entry.key]!.setError(entry.value);
      }
    }
    _formError = formError;
    notifyListeners();
  }

  void reset() {
    for (final field in _fields.values) {
      field.reset();
    }
    _formError = null;
    notifyListeners();
  }

  Future<void> _validateSingleField(String name) async {
    final field = _fields[name]!;
    final fieldSchema =
        schema.fields.firstWhere((f) => f.name == name);

    _runSyncValidators(name);

    if (field.isValid && fieldSchema.asyncValidatorFactory != null) {
      field.setPending(true);
      notifyListeners();
      try {
        final asyncValidator = await fieldSchema.asyncValidatorFactory!();
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
    final fieldSchema =
        schema.fields.firstWhere((f) => f.name == name);
    final composed = composeValidators(fieldSchema.validators);
    field.setError(composed(field.value));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/forms/form_controller_test.dart`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd flutter/apps/web && git add lib/core/forms/form_controller.dart test/core/forms/form_controller_test.dart
git commit -m "feat(forms): add FormController with validate, touch, server errors"
```

---

### Task 6: Create ServerErrorMapper

**Files:**
- Create: `flutter/apps/web/lib/core/forms/server_error_mapper.dart`
- Create: `flutter/apps/web/test/core/forms/server_error_mapper_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/core/forms/server_error_mapper_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/server_error_mapper.dart';

void main() {
  group('ServerErrorMapper', () {
    test('maps field errors from response with errors object', () {
      final response = {
        'code': 422,
        'errors': {
          'email': ['已被注册'],
          'username': ['太短'],
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], '已被注册');
      expect(result.fieldErrors['username'], '太短');
      expect(result.formError, isNull);
    });

    test('takes first message when errors has array', () {
      final response = {
        'errors': {
          'email': ['error1', 'error2'],
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], 'error1');
    });

    test('maps formError from message field', () {
      final response = {
        'code': 400,
        'message': '网络异常',
      };
      final result = ServerErrorMapper.map(response);
      expect(result.formError, '网络异常');
      expect(result.fieldErrors, isEmpty);
    });

    test('maps formError from detail field', () {
      final response = {
        'detail': '服务器内部错误',
      };
      final result = ServerErrorMapper.map(response);
      expect(result.formError, '服务器内部错误');
    });

    test('fieldAlias renames field keys', () {
      final response = {
        'errors': {
          'user_name': ['太短'],
        },
      };
      final result = ServerErrorMapper.map(
        response,
        fieldAlias: {'user_name': 'username'},
      );
      expect(result.fieldErrors['username'], '太短');
      expect(result.fieldErrors.containsKey('user_name'), isFalse);
    });

    test('returns empty errors for null response', () {
      final result = ServerErrorMapper.map(null);
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('returns empty errors for non-map response', () {
      final result = ServerErrorMapper.map('string response');
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('returns empty errors for empty map', () {
      final result = ServerErrorMapper.map({});
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('handles errors with non-list values', () {
      final response = {
        'errors': {
          'email': 'single error string',
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], 'single error string');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/forms/server_error_mapper_test.dart`
Expected: FAIL — cannot find `server_error_mapper.dart`

- [ ] **Step 3: Implement ServerErrorMapper**

```dart
// flutter/apps/web/lib/core/forms/server_error_mapper.dart

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
    if (response == null || response is! Map<String, dynamic>) {
      return const ServerErrors();
    }

    final fieldErrors = <String, String>{};

    // Extract field errors from "errors" object
    final errors = response['errors'];
    if (errors != null && errors is Map<String, dynamic>) {
      for (final entry in errors.entries) {
        final key = fieldAlias != null && fieldAlias.containsKey(entry.key)
            ? fieldAlias[entry.key]!
            : entry.key;

        final value = entry.value;
        if (value is List && value.isNotEmpty) {
          fieldErrors[key] = value.first.toString();
        } else if (value != null) {
          fieldErrors[key] = value.toString();
        }
      }
    }

    // Extract form-level error
    String? formError;
    if (response.containsKey('message')) {
      formError = response['message']?.toString();
    } else if (response.containsKey('detail')) {
      formError = response['detail']?.toString();
    }

    return ServerErrors(
      fieldErrors: fieldErrors,
      formError: formError,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/forms/server_error_mapper_test.dart`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd flutter/apps/web && git add lib/core/forms/server_error_mapper.dart test/core/forms/server_error_mapper_test.dart
git commit -m "feat(forms): add ServerErrorMapper for field-level error mapping"
```

---

### Task 7: Create ValidatedForm and ValidatedFormField widgets

**Files:**
- Create: `flutter/apps/web/lib/widgets/validated_form.dart`
- Create: `flutter/apps/web/lib/widgets/validated_form_field.dart`
- Create: `flutter/apps/web/test/widgets/validated_form_field_test.dart`
- Create: `flutter/apps/web/test/widgets/validated_form_test.dart`

- [ ] **Step 1: Write ValidatedForm widget test**

```dart
// test/widgets/validated_form_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/widgets/validated_form.dart';

void main() {
  group('ValidatedForm', () {
    testWidgets('provides controller via InheritedWidget', (tester) async {
      final controller = FormController(
        FormSchema(fields: [
          FormFieldSchema(name: 'field1'),
        ]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            child: Builder(
              builder: (context) {
                final provided = ValidatedForm.of(context);
                return Text(provided.field('field1').value.isEmpty ? 'empty' : 'has value');
              },
            ),
          ),
        ),
      );

      expect(find.text('empty'), findsOneWidget);
    });

    testWidgets('rebuilds children when controller notifies', (tester) async {
      final controller = FormController(
        FormSchema(fields: [
          FormFieldSchema(name: 'field1'),
        ]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            child: Builder(
              builder: (context) {
                final provided = ValidatedForm.of(context);
                return Text(provided.field('field1').value.isEmpty ? 'empty' : 'filled');
              },
            ),
          ),
        ),
      );

      expect(find.text('empty'), findsOneWidget);

      controller.updateField('field1', 'hello');
      await tester.pump();

      expect(find.text('filled'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Write ValidatedFormField widget test**

```dart
// test/widgets/validated_form_field_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';

void main() {
  FormController _controller() => FormController(
        FormSchema(fields: [
          FormFieldSchema(
            name: 'username',
            validators: [FormValidators.required('required')],
          ),
        ]),
      );

  Widget _build(FormController controller) {
    return MaterialApp(
      home: Scaffold(
        body: ValidatedForm(
          controller: controller,
          child: ValidatedFormField(
            controller: controller,
            name: 'username',
            label: 'Username',
            icon: Icons.person,
          ),
        ),
      ),
    );
  }

  group('ValidatedFormField', () {
    testWidgets('renders TextFormField with label', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));
      expect(find.byType(TextFormField), findsOneWidget);
      expect(find.text('Username'), findsOneWidget);
    });

    testWidgets('does not show error before touch', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      // Submit the form to trigger validation without touching field
      final form = find.byType(Form);
      // We don't have a Form widget directly, so let's validate via controller
      await controller.validate();
      await tester.pump();

      // Error should not show because field is not touched
      expect(find.text('required'), findsNothing);
    });

    testWidgets('shows error after touch and validation', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      // Touch and validate
      controller.touchField('username');
      await tester.pump();

      expect(find.text('required'), findsOneWidget);
    });

    testWidgets('updates field value on input', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      await tester.enterText(find.byType(TextFormField), 'john');
      await tester.pump();

      expect(controller.field('username').value, 'john');
    });

    testWidgets('clears error when value becomes valid', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      // Touch to show errors
      controller.touchField('username');
      await tester.pump();
      expect(find.text('required'), findsOneWidget);

      // Enter valid value
      await tester.enterText(find.byType(TextFormField), 'john');
      await tester.pump();

      // Error should be cleared (updateField on touched field runs validators)
      expect(find.text('required'), findsNothing);
    });

    testWidgets('shows loading indicator when pending', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      controller.field('username').setPending(true);
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd flutter/apps/web && dart test test/widgets/validated_form_test.dart test/widgets/validated_form_field_test.dart`
Expected: FAIL — cannot find widget files

- [ ] **Step 4: Implement ValidatedForm**

```dart
// flutter/apps/web/lib/widgets/validated_form.dart
import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

class ValidatedForm extends InheritedWidget {
  final FormController controller;

  const ValidatedForm({
    super.key,
    required this.controller,
    required super.child,
  }) : super();

  static FormController of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ValidatedForm>()!.controller;
  }

  @override
  bool updateShouldNotify(ValidatedForm oldWidget) {
    return controller != oldWidget.controller;
  }
}
```

- [ ] **Step 5: Implement ValidatedFormField**

```dart
// flutter/apps/web/lib/widgets/validated_form_field.dart
import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

class ValidatedFormField extends StatefulWidget {
  final FormController controller;
  final String name;
  final String label;
  final IconData? icon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int maxLines;

  const ValidatedFormField({
    super.key,
    required this.controller,
    required this.name,
    required this.label,
    this.icon,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
  });

  @override
  State<ValidatedFormField> createState() => _ValidatedFormFieldState();
}

class _ValidatedFormFieldState extends State<ValidatedFormField> {
  bool _obscured = true;

  @override
  void initState() {
    super.initState();
    _obscured = widget.obscureText;
  }

  @override
  Widget build(BuildContext context) {
    final field = widget.controller.field(widget.name);

    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        return TextFormField(
          initialValue: field.value,
          obscureText: widget.obscureText ? _obscured : false,
          keyboardType: widget.keyboardType,
          maxLines: widget.obscureText ? 1 : widget.maxLines,
          decoration: InputDecoration(
            labelText: widget.label,
            prefixIcon: widget.icon != null ? Icon(widget.icon) : null,
            suffixIcon: _buildSuffix(field),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            errorText:
                field.touched && field.error != null ? field.error : null,
          ),
          onChanged: (value) {
            widget.controller.updateField(widget.name, value);
          },
          onEditingComplete: () {
            widget.controller.touchField(widget.name);
            widget.controller.validateField(widget.name);
            Focus.of(context).nextFocus();
          },
          onFieldSubmitted: (_) {
            widget.controller.touchField(widget.name);
            widget.controller.validateField(widget.name);
          },
        );
      },
    );
  }

  Widget? _buildSuffix(dynamic field) {
    if (field.pending) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (widget.obscureText) {
      return IconButton(
        icon: Icon(_obscured ? Icons.visibility_off : Icons.visibility),
        onPressed: () => setState(() => _obscured = !_obscured),
      );
    }
    return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd flutter/apps/web && dart test test/widgets/validated_form_test.dart test/widgets/validated_form_field_test.dart`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd flutter/apps/web && git add lib/widgets/validated_form.dart lib/widgets/validated_form_field.dart test/widgets/validated_form_test.dart test/widgets/validated_form_field_test.dart
git commit -m "feat(forms): add ValidatedForm and ValidatedFormField widgets"
```

---

### Task 8: Refactor LoginPage

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`

- [ ] **Step 1: Refactor LoginPage to use FormSchema + FormController**

Replace the entire file content with:

```dart
// flutter/apps/web/lib/features/auth/presentation/login_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/core/utils/responsive.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';
import 'auth_provider.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  late FormController _formController;
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
    final loc = AppLocalizations.of(context)!;

    // Build schema with localized messages
    _formController = FormController(FormSchema(fields: [
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

    // Show server errors via SnackBar
    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (next.error != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error!)),
        );
      }
    });

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: ResponsiveLayout.isMobile(context)
                ? const [Color(0xFF667eea), Color(0xFF764ba2)]
                : const [Color(0xFF667eea), Color(0xFF764ba2), Color(0xFF6B73FF)],
          ),
        ),
        child: DecorativeBackground(
          child: FadeTransition(
            opacity: _fadeAnimation,
            child: SlideTransition(
              position: _slideAnimation,
              child: ResponsiveLayout.isMobile(context)
                  ? _buildMobileLayout(authState, loc)
                  : _buildDesktopLayout(authState, loc),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMobileLayout(AuthState authState, AppLocalizations loc) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: AuthCard(
          title: loc.loginTitle,
          subtitle: loc.loginSubtitle ?? loc.loginTitle,
          child: _buildForm(authState, loc),
        ),
      ),
    );
  }

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
                subtitle: loc.loginSubtitle ?? loc.loginTitle,
                child: _buildForm(authState, loc),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AuthState authState, AppLocalizations loc) {
    return ValidatedForm(
      controller: _formController,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ValidatedFormField(
            controller: _formController,
            name: 'username',
            label: loc.loginUsername,
            icon: Icons.person,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock,
            obscureText: true,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                height: 24,
                width: 24,
                child: Checkbox(
                  value: _rememberMe,
                  onChanged: (value) {
                    setState(() {
                      _rememberMe = value ?? false;
                    });
                  },
                  activeColor: const Color(0xFF667eea),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'Remember me',
                style: TextStyle(fontSize: 14),
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
            child: Text('${loc.loginNoAccount} ${loc.loginRegister}'),
          ),
        ],
      ),
    );
  }

  void _login() async {
    final valid = await _formController.validate();
    if (!valid) return;

    final values = _formController.values;
    ref.read(authStateProvider.notifier).login(
          values['username']!.trim(),
          values['password']!,
          rememberMe: _rememberMe,
        );
  }

  @override
  void dispose() {
    _formController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/login_page.dart`
Expected: No errors (warnings about `loginSubtitle` not existing in ARB may appear — use `loc.loginTitle` as fallback if needed)

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add lib/features/auth/presentation/login_page.dart
git commit -m "feat(forms): refactor LoginPage to use FormSchema + FormController"
```

---

### Task 9: Refactor RegisterPage

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`

- [ ] **Step 1: Refactor RegisterPage**

Replace the entire file content with:

```dart
// flutter/apps/web/lib/features/auth/presentation/register_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_field_state.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/core/utils/responsive.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';
import 'package:im_web/features/auth/presentation/widgets/agreement_dialog.dart';
import 'auth_provider.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage>
    with SingleTickerProviderStateMixin {
  late FormController _formController;
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
    final loc = AppLocalizations.of(context)!;

    // Build schema with localized messages
    final passwordField = FormFieldState(name: 'password');
    _formController = FormController(FormSchema(fields: [
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
          FormValidators.sameAs(passwordField, loc.validationPasswordMismatch),
        ],
      ),
    ]));

    // Show server errors via SnackBar
    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (next.error != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error!)),
        );
      }
    });

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: ResponsiveLayout.isMobile(context)
                ? const [Color(0xFF667eea), Color(0xFF764ba2)]
                : const [Color(0xFF667eea), Color(0xFF764ba2), Color(0xFF6B73FF)],
          ),
        ),
        child: DecorativeBackground(
          child: FadeTransition(
            opacity: _fadeAnimation,
            child: SlideTransition(
              position: _slideAnimation,
              child: ResponsiveLayout.isMobile(context)
                  ? _buildMobileLayout(authState, loc)
                  : _buildDesktopLayout(authState, loc),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMobileLayout(AuthState authState, AppLocalizations loc) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: AuthCard(
          title: loc.registerTitle ?? loc.loginRegister,
          subtitle: loc.registerSubtitle ?? '',
          child: _buildForm(authState, loc),
        ),
      ),
    );
  }

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
                title: loc.registerTitle ?? loc.loginRegister,
                subtitle: loc.registerSubtitle ?? '',
                child: _buildForm(authState, loc),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AuthState authState, AppLocalizations loc) {
    return ValidatedForm(
      controller: _formController,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ValidatedFormField(
            controller: _formController,
            name: 'username',
            label: loc.loginUsername,
            icon: Icons.person,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'email',
            label: loc.profileEmail,
            icon: Icons.email,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock,
            obscureText: true,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'confirmPassword',
            label: loc.profileConfirmPassword,
            icon: Icons.lock,
            obscureText: true,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                height: 24,
                width: 24,
                child: Checkbox(
                  value: _agreementAccepted,
                  onChanged: (value) {
                    setState(() {
                      _agreementAccepted = value ?? false;
                    });
                  },
                  activeColor: const Color(0xFF667eea),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Wrap(
                  children: [
                    Text(
                      '${loc.validationAgreementRequired.substring(0, 0)}', // placeholder
                      style: const TextStyle(fontSize: 14),
                    ),
                    GestureDetector(
                      onTap: () => AgreementDialog.show(
                        context,
                        loc.profilePrivacy,
                        userAgreementContent,
                      ),
                      child: Text(
                        loc.profilePrivacy,
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
            text: loc.loginRegister,
            isLoading: authState.isLoading,
            onPressed: _register,
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => context.go('/login'),
            child: Text('${loc.loginNoAccount} ${loc.loginButton}'),
          ),
        ],
      ),
    );
  }

  void _register() async {
    if (!_agreementAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context)!.validationAgreementRequired)),
      );
      return;
    }

    final valid = await _formController.validate();
    if (!valid) return;

    final values = _formController.values;
    ref.read(authStateProvider.notifier).register(
          values['username']!.trim(),
          values['email']!.trim(),
          values['password']!,
        );
  }

  @override
  void dispose() {
    _formController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/features/auth/presentation/register_page.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add lib/features/auth/presentation/register_page.dart
git commit -m "feat(forms): refactor RegisterPage with FormSchema, sameAs, agreement validation"
```

---

### Task 10: Refactor ProfilePage

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/profile_page.dart`

- [ ] **Step 1: Refactor ProfilePage to use FormSchema + FormController**

Key changes:
- Replace `GlobalKey<FormState>` + `TextEditingController`s with `FormController`
- Replace inline validators with `FormSchema` + `FormValidators`
- Keep non-form fields (gender radio, birthday picker) managed separately
- Show success/error via SnackBar (already done)

```dart
// flutter/apps/web/lib/features/settings/presentation/profile_page.dart
// Key changes — keep existing structure, replace form internals:
//
// 1. Add imports:
//    import 'package:im_web/core/forms/form_controller.dart';
//    import 'package:im_web/core/forms/form_schema.dart';
//    import 'package:im_web/core/forms/validators.dart';
//    import 'package:im_web/widgets/validated_form.dart';
//    import 'package:im_web/widgets/validated_form_field.dart';
//
// 2. Replace _formKey + controllers with:
//    late FormController _formController;
//    // Initialize in _initControllers after reading user data
//
// 3. Replace Form + TextFormField widgets with ValidatedForm + ValidatedFormField
//
// 4. Replace _formKey.currentState!.validate() with _formController.validate()
//
// 5. Replace _formKey.currentState!.reset() with _formController.reset()
```

Replace the entire file:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/features/settings/presentation/widgets/profile_hero.dart';
import 'package:im_web/features/settings/presentation/widgets/settings_section.dart';
import 'package:im_web/features/settings/presentation/widgets/password_dialog.dart';
import 'package:im_web/features/settings/presentation/widgets/bind_phone_dialog.dart';
import 'package:im_web/features/settings/presentation/widgets/bind_email_dialog.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_core/core.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  FormController? _formController;
  String _gender = '';
  DateTime? _birthday;
  bool _initialized = false;

  @override
  void dispose() {
    _formController?.dispose();
    super.dispose();
  }

  void _initControllers(User user, AppLocalizations loc) {
    if (_initialized) return;
    _formController = FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'nickname',
        initialValue: user.nickname ?? '',
        validators: [
          FormValidators.required(loc.validationNicknameRequired),
          FormValidators.maxLength(20, loc.validationNicknameMaxLength(20)),
        ],
      ),
      FormFieldSchema(
        name: 'email',
        initialValue: user.email ?? '',
        validators: [
          FormValidators.email(loc.validationEmailInvalid),
        ],
      ),
      FormFieldSchema(
        name: 'signature',
        initialValue: user.signature ?? '',
      ),
      FormFieldSchema(
        name: 'location',
        initialValue: user.location ?? '',
      ),
    ]));
    _gender = user.gender ?? '';
    _birthday = user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    _initialized = true;
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final user = authState.user;
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }

    _initControllers(user, loc);
    final controller = _formController!;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ProfileHero(user: user, onAvatarTap: () {}),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SettingsSection(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: ValidatedForm(
                      controller: controller,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(loc.profileAccountInfo, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 16),
                          TextFormField(
                            initialValue: user.username,
                            decoration: InputDecoration(labelText: loc.profileUsername),
                            enabled: false,
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: controller,
                            name: 'nickname',
                            label: loc.profileNickname,
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: controller,
                            name: 'email',
                            label: loc.profileEmail,
                            keyboardType: TextInputType.emailAddress,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            initialValue: user.phone,
                            decoration: InputDecoration(labelText: loc.profilePhone),
                            enabled: false,
                          ),
                          const SizedBox(height: 12),
                          Text(loc.profileGender, style: theme.textTheme.bodyMedium),
                          Row(
                            children: [
                              Radio<String>(
                                value: 'male',
                                groupValue: _gender,
                                onChanged: (v) => setState(() => _gender = v ?? ''),
                              ),
                              Text(loc.profileGenderMale),
                              Radio<String>(
                                value: 'female',
                                groupValue: _gender,
                                onChanged: (v) => setState(() => _gender = v ?? ''),
                              ),
                              Text(loc.profileGenderFemale),
                              Radio<String>(
                                value: 'secret',
                                groupValue: _gender,
                                onChanged: (v) => setState(() => _gender = v ?? ''),
                              ),
                              Text(loc.profileGenderSecret),
                            ],
                          ),
                          const SizedBox(height: 12),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(loc.profileBirthday),
                            subtitle: Text(_birthday != null
                                ? '${_birthday!.year}-${_birthday!.month.toString().padLeft(2, '0')}-${_birthday!.day.toString().padLeft(2, '0')}'
                                : loc.profileBirthday),
                            trailing: const Icon(Icons.calendar_today),
                            onTap: () async {
                              final date = await showDatePicker(
                                context: context,
                                initialDate: _birthday ?? DateTime(2000),
                                firstDate: DateTime(1950),
                                lastDate: DateTime.now(),
                              );
                              if (date != null) setState(() => _birthday = date);
                            },
                          ),
                          const SizedBox(height: 12),
                          ValidatedFormField(
                            controller: controller,
                            name: 'signature',
                            label: loc.profileSignature,
                            maxLines: 3,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              FilledButton(
                                onPressed: _save,
                                child: Text(loc.profileSave),
                              ),
                              const SizedBox(width: 12),
                              OutlinedButton(
                                onPressed: _reset,
                                child: Text(loc.profileReset),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            SizedBox(
              width: 340,
              child: Column(
                children: [
                  SettingsSection(
                    title: loc.profileSecurity,
                    children: [
                      ListTile(
                        title: Text(loc.profilePassword),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(loc.profileChange, style: TextStyle(color: theme.colorScheme.primary)),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(context: context, builder: (_) => const PasswordDialog()),
                      ),
                      Divider(height: 1, color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3)),
                      ListTile(
                        title: Text(loc.profilePhoneVerify),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              user.phone != null ? loc.profileBound : loc.profileUnbound,
                              style: TextStyle(color: user.phone != null ? Colors.green : theme.colorScheme.onSurfaceVariant),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(context: context, builder: (_) => const BindPhoneDialog()),
                      ),
                      Divider(height: 1, color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3)),
                      ListTile(
                        title: Text(loc.profileEmailVerify),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              user.email != null ? loc.profileBound : loc.profileUnbound,
                              style: TextStyle(color: user.email != null ? Colors.green : theme.colorScheme.onSurfaceVariant),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        onTap: () => showDialog(context: context, builder: (_) => const BindEmailDialog()),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SettingsSection(
                    title: loc.profilePrivacy,
                    children: [
                      SwitchListTile(
                        title: Text(loc.profileAllowStrangerAdd),
                        subtitle: Text(loc.profileAllowStrangerAddDesc, style: const TextStyle(fontSize: 12)),
                        value: ref.watch(settingsStateProvider)?.privacy.allowStrangerAdd ?? false,
                        onChanged: (v) {
                          final s = ref.read(settingsStateProvider);
                          if (s != null) {
                            ref.read(settingsStateProvider.notifier).updatePrivacySettings(
                              s.privacy.copyWith(allowStrangerAdd: v),
                            );
                          }
                        },
                      ),
                      SwitchListTile(
                        title: Text(loc.profileShowOnlineStatus),
                        subtitle: Text(loc.profileShowOnlineStatusDesc, style: const TextStyle(fontSize: 12)),
                        value: ref.watch(settingsStateProvider)?.privacy.showOnlineStatus ?? false,
                        onChanged: (v) {
                          final s = ref.read(settingsStateProvider);
                          if (s != null) {
                            ref.read(settingsStateProvider.notifier).updatePrivacySettings(
                              s.privacy.copyWith(showOnlineStatus: v),
                            );
                          }
                        },
                      ),
                      SwitchListTile(
                        title: Text(loc.profileAllowViewMoments),
                        subtitle: Text(loc.profileAllowViewMomentsDesc, style: const TextStyle(fontSize: 12)),
                        value: ref.watch(settingsStateProvider)?.privacy.allowViewMoments ?? false,
                        onChanged: (v) {
                          final s = ref.read(settingsStateProvider);
                          if (s != null) {
                            ref.read(settingsStateProvider.notifier).updatePrivacySettings(
                              s.privacy.copyWith(allowViewMoments: v),
                            );
                          }
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _save() async {
    if (!(_formController?.validate() ?? Future.value(false))) return;
    final loc = AppLocalizations.of(context)!;
    final values = _formController!.values;
    try {
      await ref.read(profileStateProvider.notifier).updateProfile(
        UpdateProfileRequest(
          nickname: values['nickname']?.trim() ?? '',
          email: values['email']?.trim() ?? '',
          gender: _gender,
          birthday: _birthday?.toIso8601String(),
          signature: values['signature']?.trim() ?? '',
          location: values['location']?.trim() ?? '',
        ),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.profileSaved)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.profileUpdateFailed)),
        );
      }
    }
  }

  void _reset() {
    _formController?.reset();
    final user = ref.read(authStateProvider).user;
    if (user == null) return;
    setState(() {
      _gender = user.gender ?? '';
      _birthday = user.birthday != null ? DateTime.tryParse(user.birthday!) : null;
    });
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/features/settings/presentation/profile_page.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add lib/features/settings/presentation/profile_page.dart
git commit -m "feat(forms): refactor ProfilePage with FormSchema and FormValidators"
```

---

### Task 11: Refactor PasswordDialog

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/widgets/password_dialog.dart`

- [ ] **Step 1: Refactor PasswordDialog**

Key changes:
- Replace `GlobalKey<FormState>` + `TextEditingController`s with `FormController`
- Unify password length to 8-64 (was 6-20)
- Use `FormValidators` with localized messages
- Show errors via SnackBar (already done)

```dart
// flutter/apps/web/lib/features/settings/presentation/widgets/password_dialog.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_field_state.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';

class PasswordDialog extends ConsumerStatefulWidget {
  const PasswordDialog({super.key});

  @override
  ConsumerState<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends ConsumerState<PasswordDialog> {
  late FormController _formController;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    // Schema will be built in build() to access loc
  }

  void _initController(AppLocalizations loc) {
    final newPasswordField = FormFieldState(name: 'newPassword');
    _formController = FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'currentPassword',
        validators: [
          FormValidators.required(loc.validationRequired),
        ],
      ),
      FormFieldSchema(
        name: 'newPassword',
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
          FormValidators.sameAs(newPasswordField, loc.validationPasswordMismatch),
        ],
      ),
    ]));
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    _initController(loc);

    return AlertDialog(
      title: Text(loc.profileChangePassword),
      content: ValidatedForm(
        controller: _formController,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValidatedFormField(
              controller: _formController,
              name: 'currentPassword',
              label: loc.profileCurrentPassword,
              obscureText: true,
            ),
            const SizedBox(height: 12),
            ValidatedFormField(
              controller: _formController,
              name: 'newPassword',
              label: loc.profileNewPassword,
              obscureText: true,
            ),
            const SizedBox(height: 12),
            ValidatedFormField(
              controller: _formController,
              name: 'confirmPassword',
              label: loc.profileConfirmPassword,
              obscureText: true,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(loc.commonCancel),
        ),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(loc.commonConfirm),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final valid = await _formController.validate();
    if (!valid) return;
    setState(() => _loading = true);
    try {
      final values = _formController.values;
      await ref.read(profileStateProvider.notifier).changePassword(
        ChangePasswordRequest(
          currentPassword: values['currentPassword']!,
          newPassword: values['newPassword']!,
        ),
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.profilePasswordUpdated)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/features/settings/presentation/widgets/password_dialog.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add lib/features/settings/presentation/widgets/password_dialog.dart
git commit -m "feat(forms): refactor PasswordDialog with FormSchema, unify password to 8-64"
```

---

### Task 12: Remove old Validators class and update existing tests

**Files:**
- Modify: `flutter/apps/web/lib/core/utils/validators.dart`
- Modify: `flutter/apps/web/test/core/utils/validators_test.dart`

- [ ] **Step 1: Deprecate old Validators class**

Replace `core/utils/validators.dart` with a deprecation shim:

```dart
// flutter/apps/web/lib/core/utils/validators.dart
// DEPRECATED: Use package:im_web/core/forms/validators.dart instead.
// This file is kept temporarily for backward compatibility.

@Deprecated('Use FormValidators from core/forms/validators.dart')
class Validators {
  @Deprecated('Use FormValidators.required + FormValidators.minLength + FormValidators.maxLength + FormValidators.pattern')
  static String? validateUsername(String? value) {
    if (value == null || value.isEmpty) return '请输入用户名';
    if (value.length < 3 || value.length > 20) return '用户名长度在 3 到 20 个字符';
    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(value)) return '用户名只能包含字母、数字和下划线';
    return null;
  }

  @Deprecated('Use FormValidators.required + FormValidators.email')
  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) return '请输入邮箱';
    if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) return '请输入正确的邮箱格式';
    return null;
  }

  @Deprecated('Use FormValidators.required + FormValidators.minLength + FormValidators.maxLength + FormValidators.passwordStrength')
  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) return '请输入密码';
    if (value.length < 8 || value.length > 64) return '密码长度在 8 到 64 个字符';
    if (!RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$').hasMatch(value)) return '密码必须包含字母和数字';
    return null;
  }

  @Deprecated('Use FormValidators.required + FormValidators.sameAs')
  static String? validateConfirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) return '请确认密码';
    if (value != password) return '两次输入密码不一致';
    return null;
  }
}
```

- [ ] **Step 2: Update old validators test to suppress deprecation warnings**

```dart
// flutter/apps/web/test/core/utils/validators_test.dart
// ignore_for_file: deprecated_member_use_from_same_package
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/utils/validators.dart';

void main() {
  group('Validators (deprecated)', () {
    // ... keep existing tests as-is ...
  });
}
```

- [ ] **Step 3: Verify no compilation errors**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors (deprecation warnings are expected)

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add lib/core/utils/validators.dart test/core/utils/validators_test.dart
git commit -m "feat(forms): deprecate old Validators class in favor of FormValidators"
```

---

### Task 13: Run all tests and verify

- [ ] **Step 1: Run all unit tests**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests PASS (new form tests + existing deprecated validator tests)

- [ ] **Step 2: Run flutter analyze**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors (deprecation warnings on old Validators usage are expected)

- [ ] **Step 3: Final commit if any fixes needed**

```bash
cd flutter/apps/web && git add -A && git commit -m "fix(forms): address test and analysis issues"
```

(Only if there are fixes. Skip if everything passes.)
