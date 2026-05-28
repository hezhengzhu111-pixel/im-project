# FormErrorBanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FormController.formError 被表单组件消费，实现字段错误、服务端错误、全局表单错误三层一致展示。

**Architecture:** 新建 FormErrorBanner 组件，ValidatedForm 自动渲染 FormErrorBanner，FormController 新增 setFormError/clearFormError 方法，LoginPage/RegisterPage 移除 SnackBar 改用 formError。

**Tech Stack:** Flutter, Dart, ChangeNotifier, InheritedWidget, l10n

---

## File Structure

```
flutter/apps/web/
├── lib/
│   ├── core/forms/
│   │   └── form_controller.dart          — Modify: add setFormError/clearFormError
│   ├── widgets/
│   │   ├── form_error_banner.dart         — Create: new component
│   │   └── validated_form.dart            — Modify: auto-render FormErrorBanner
│   ├── features/auth/presentation/
│   │   ├── login_page.dart                — Modify: remove SnackBar, use setFormError
│   │   └── register_page.dart             — Modify: remove SnackBar, use setFormError
│   └── l10n/
│       ├── app_en.arb                     — Modify: add form error keys
│       ├── app_zh.arb                     — Modify: add form error keys
│       ├── app_localizations.dart         — Modify: regenerate (auto)
│       └── app_localizations_en.dart      — Modify: regenerate (auto)
│       └── app_localizations_zh.dart      — Modify: regenerate (auto)
└── test/
    ├── core/forms/
    │   └── form_controller_test.dart      — Modify: add setFormError/clearFormError tests
    └── widgets/
        ├── form_error_banner_test.dart    — Create: widget tests
        └── validated_form_test.dart       — Modify: add showErrorBanner tests
```

---

## Task 1: Add i18n Keys for Form Errors

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`

- [ ] **Step 1: Add English i18n keys**

Add to `app_en.arb` (before the closing `}`):

```json
"formErrorServer": "Server error. Please try again.",
"formErrorNetwork": "Network error. Please check your connection.",
"formErrorAuth": "Invalid username or password.",
"formErrorRateLimit": "Too many attempts. Please try again later."
```

- [ ] **Step 2: Add Chinese i18n keys**

Add to `app_zh.arb` (before the closing `}`):

```json
"formErrorServer": "服务器错误，请重试。",
"formErrorNetwork": "网络错误，请检查连接。",
"formErrorAuth": "用户名或密码错误。",
"formErrorRateLimit": "尝试次数过多，请稍后重试。"
```

- [ ] **Step 3: Run code generation**

```bash
cd flutter/apps/web && dart run intl_utils:generate
```

- [ ] **Step 4: Verify generated files**

Check `app_localizations.dart`, `app_localizations_en.dart`, `app_localizations_zh.dart` contain new keys.

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/l10n/
git commit -m "feat(i18n): add form error message keys"
```

---

## Task 2: Add setFormError/clearFormError to FormController

**Files:**
- Modify: `flutter/apps/web/lib/core/forms/form_controller.dart`
- Modify: `flutter/apps/web/test/core/forms/form_controller_test.dart`

- [ ] **Step 1: Write failing tests**

Add to `form_controller_test.dart`:

```dart
group('formError management', () {
  test('setFormError sets formError', () {
    final controller = FormController(_testSchema());
    controller.setFormError('Test error');
    expect(controller.formError, 'Test error');
  });

  test('setFormError notifies listeners', () {
    final controller = FormController(_testSchema());
    var notified = false;
    controller.addListener(() => notified = true);
    controller.setFormError('Test error');
    expect(notified, isTrue);
  });

  test('clearFormError clears formError', () {
    final controller = FormController(_testSchema());
    controller.setFormError('Test error');
    controller.clearFormError();
    expect(controller.formError, isNull);
  });

  test('clearFormError notifies listeners', () {
    final controller = FormController(_testSchema());
    controller.setFormError('Test error');
    var notified = false;
    controller.addListener(() => notified = true);
    controller.clearFormError();
    expect(notified, isTrue);
  });

  test('applyServerErrors uses setFormError internally', () {
    final controller = FormController(_testSchema());
    controller.applyServerErrors({}, formError: 'network error');
    expect(controller.formError, 'network error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd flutter/apps/web && flutter test test/core/forms/form_controller_test.dart
```

Expected: FAIL with "method not defined"

- [ ] **Step 3: Implement setFormError and clearFormError**

Add to `form_controller.dart` (after `touchField` method):

```dart
void setFormError(String? error) {
  _formError = error;
  notifyListeners();
}

void clearFormError() {
  _formError = null;
  notifyListeners();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter/apps/web && flutter test test/core/forms/form_controller_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/forms/form_controller.dart flutter/apps/web/test/core/forms/form_controller_test.dart
git commit -m "feat(forms): add setFormError/clearFormError methods"
```

---

## Task 3: Create FormErrorBanner Component

**Files:**
- Create: `flutter/apps/web/lib/widgets/form_error_banner.dart`
- Create: `flutter/apps/web/test/widgets/form_error_banner_test.dart`

- [ ] **Step 1: Write failing tests**

Create `form_error_banner_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/widgets/form_error_banner.dart';
import 'package:im_web/widgets/validated_form.dart';

void main() {
  Widget buildTestWidget(FormController controller) {
    return MaterialApp(
      home: Scaffold(
        body: ValidatedForm(
          controller: controller,
          child: const SizedBox(),
        ),
      ),
    );
  }

  group('FormErrorBanner', () {
    testWidgets('does not show when formError is null', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('shows when formError is set', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('hides after clearFormError', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();
      controller.clearFormError();
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsNothing);
    });

    testWidgets('dismiss button hides error', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsNothing);
    });

    testWidgets('new error reappears after dismiss', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('First error');
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      controller.setFormError('Second error');
      await tester.pumpAndSettle();

      expect(find.text('Second error'), findsOneWidget);
    });

    testWidgets('uses theme error color', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      final container = tester.widget<Container>(
        find.ancestor(of: find.byIcon(Icons.error_outline), matching: find.byType(Container)).first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, isNotNull);
    });
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd flutter/apps/web && flutter test test/widgets/form_error_banner_test.dart
```

Expected: FAIL with "file not found"

- [ ] **Step 3: Implement FormErrorBanner**

Create `form_error_banner.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

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

class _FormErrorBannerState extends State<FormErrorBanner> {
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant FormErrorBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (widget.controller.formError != null) {
      setState(() => _dismissed = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final formError = widget.controller.formError;

        if (formError == null || _dismissed) {
          return const SizedBox.shrink();
        }

        final colorScheme = Theme.of(context).colorScheme;

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: colorScheme.errorContainer,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colorScheme.error),
          ),
          child: Row(
            children: [
              Icon(
                Icons.error_outline,
                color: colorScheme.error,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  formError,
                  style: TextStyle(
                    color: colorScheme.onErrorContainer,
                    fontSize: 14,
                  ),
                ),
              ),
              if (widget.dismissible)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() => _dismissed = true),
                  color: colorScheme.error,
                ),
            ],
          ),
        );
      },
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter/apps/web && flutter test test/widgets/form_error_banner_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/widgets/form_error_banner.dart flutter/apps/web/test/widgets/form_error_banner_test.dart
git commit -m "feat(widgets): add FormErrorBanner component"
```

---

## Task 4: Modify ValidatedForm to Auto-Render FormErrorBanner

**Files:**
- Modify: `flutter/apps/web/lib/widgets/validated_form.dart`
- Modify: `flutter/apps/web/test/widgets/validated_form_test.dart`

- [ ] **Step 1: Write failing tests**

Add to `validated_form_test.dart`:

```dart
testWidgets('shows FormErrorBanner by default', (tester) async {
  final controller = FormController(
    FormSchema(fields: [FormFieldSchema(name: 'field1')]),
  );

  await tester.pumpWidget(
    MaterialApp(
      home: ValidatedForm(
        controller: controller,
        child: const SizedBox(),
      ),
    ),
  );

  controller.setFormError('Test error');
  await tester.pumpAndSettle();

  expect(find.text('Test error'), findsOneWidget);
});

testWidgets('hides FormErrorBanner when showErrorBanner is false', (tester) async {
  final controller = FormController(
    FormSchema(fields: [FormFieldSchema(name: 'field1')]),
  );

  await tester.pumpWidget(
    MaterialApp(
      home: ValidatedForm(
        controller: controller,
        showErrorBanner: false,
        child: const SizedBox(),
      ),
    ),
  );

  controller.setFormError('Test error');
  await tester.pumpAndSettle();

  expect(find.text('Test error'), findsNothing);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd flutter/apps/web && flutter test test/widgets/validated_form_test.dart
```

Expected: FAIL

- [ ] **Step 3: Modify ValidatedForm**

Update `validated_form.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/widgets/form_error_banner.dart';

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

  static FormController of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_ValidatedFormInherited>()!.controller;
  }

  @override
  State<ValidatedForm> createState() => _ValidatedFormState();
}

class _ValidatedFormState extends State<ValidatedForm> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant ValidatedForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    Widget content = widget.child;

    if (widget.showErrorBanner) {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FormErrorBanner(controller: widget.controller),
          content,
        ],
      );
    }

    return _ValidatedFormInherited(
      controller: widget.controller,
      child: content,
    );
  }
}

class _ValidatedFormInherited extends InheritedWidget {
  final FormController controller;

  const _ValidatedFormInherited({
    required this.controller,
    required super.child,
  });

  @override
  bool updateShouldNotify(_ValidatedFormInherited oldWidget) {
    return true;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter/apps/web && flutter test test/widgets/validated_form_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/widgets/validated_form.dart flutter/apps/web/test/widgets/validated_form_test.dart
git commit -m "feat(widgets): ValidatedForm auto-renders FormErrorBanner"
```

---

## Task 5: Modify LoginPage to Use formError

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`

- [ ] **Step 1: Update LoginPage**

Replace the `ref.listen` block in `login_page.dart`:

**Before:**
```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(next.error!)),
    );
  }
});
```

**After:**
```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    _formController.setFormError(next.error);
  }
});
```

- [ ] **Step 2: Verify no compilation errors**

```bash
cd flutter/apps/web && flutter analyze lib/features/auth/presentation/login_page.dart
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/login_page.dart
git commit -m "feat(auth): LoginPage uses formError instead of SnackBar"
```

---

## Task 6: Modify RegisterPage to Use formError

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`

- [ ] **Step 1: Update RegisterPage**

Replace the `ref.listen` block in `register_page.dart`:

**Before:**
```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(next.error!)),
    );
  }
});
```

**After:**
```dart
ref.listen<AuthState>(authStateProvider, (prev, next) {
  if (next.error != null && mounted) {
    _formController.setFormError(next.error);
  }
});
```

- [ ] **Step 2: Verify no compilation errors**

```bash
cd flutter/apps/web && flutter analyze lib/features/auth/presentation/register_page.dart
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/register_page.dart
git commit -m "feat(auth): RegisterPage uses formError instead of SnackBar"
```

---

## Task 7: Run All Tests

- [ ] **Step 1: Run all form-related tests**

```bash
cd flutter/apps/web && flutter test test/core/forms/ test/widgets/
```

Expected: All tests pass

- [ ] **Step 2: Run full test suite**

```bash
cd flutter/apps/web && flutter test
```

Expected: All tests pass

- [ ] **Step 3: Run static analysis**

```bash
cd flutter/apps/web && flutter analyze
```

Expected: No errors

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve test/analysis issues"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Add i18n keys | app_en.arb, app_zh.arb |
| 2 | Add setFormError/clearFormError | form_controller.dart, form_controller_test.dart |
| 3 | Create FormErrorBanner | form_error_banner.dart, form_error_banner_test.dart |
| 4 | Modify ValidatedForm | validated_form.dart, validated_form_test.dart |
| 5 | Modify LoginPage | login_page.dart |
| 6 | Modify RegisterPage | register_page.dart |
| 7 | Run all tests | (verification only) |
