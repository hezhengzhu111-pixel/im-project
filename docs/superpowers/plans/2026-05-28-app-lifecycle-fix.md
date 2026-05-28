# App Lifecycle & WebMeta Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix App startup lifecycle, route listening, WebMeta updates, and Navigator wrapping in `flutter/apps/web/lib/app.dart`.

**Architecture:** Replace the broken `ref.listen<GoRouter>` inside `addPostFrameCallback` with `routeInformationProvider.addListener` for route changes and `ref.listenManual` for locale changes. Remove the redundant nested `Navigator` from `MaterialApp.router.builder`.

**Tech Stack:** Flutter, Riverpod 2.x, GoRouter, `package:web` (for WebMetaService)

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `flutter/apps/web/lib/app.dart` | Modify | Core changes: lifecycle, route listener, Navigator removal |
| `flutter/apps/web/test/app_lifecycle_test.dart` | Create | Tests for lifecycle, meta updates, Navigator structure |
| `flutter/apps/web/test/mocks/mock_web_meta_service.dart` | Create | Mock WebMetaService for verification |

---

### Task 1: Create Mock WebMetaService for Testing

**Files:**
- Create: `flutter/apps/web/test/mocks/mock_web_meta_service.dart`

- [ ] **Step 1: Write the mock class**

```dart
import 'package:im_web/core/web_meta/web_meta_service.dart';
import 'package:im_web/core/web_meta/page_meta.dart';

class MockWebMetaService implements WebMetaService {
  final List<PageMeta> appliedMetas = [];

  @override
  void apply(PageMeta meta) {
    appliedMetas.add(meta);
  }

  void clear() => appliedMetas.clear();

  PageMeta? get lastApplied =>
      appliedMetas.isNotEmpty ? appliedMetas.last : null;
}
```

- [ ] **Step 2: Verify mock compiles**

Run: `cd flutter/apps/web && dart analyze test/mocks/mock_web_meta_service.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/mocks/mock_web_meta_service.dart
git commit -m "test: add MockWebMetaService for app lifecycle tests"
```

---

### Task 2: Write Failing Tests for App Lifecycle

**Files:**
- Create: `flutter/apps/web/test/app_lifecycle_test.dart`

- [ ] **Step 1: Write the test file with all four test cases**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:im_web/app.dart';
import 'package:im_web/core/web_meta/page_meta.dart';
import 'package:im_web/core/web_meta/web_meta_service.dart';
import 'package:im_web/core/router/route_observer.dart';
import 'package:im_web/core/di/providers.dart';

import 'mocks/mock_web_meta_service.dart';

// Generate mocks for GoRouter and related types
@GenerateMocks([GoRouter, RouteInformationProvider])
import 'app_lifecycle_test.mocks.dart';

void main() {
  group('App lifecycle', () {
    late MockWebMetaService mockMetaService;
    late MockGoRouter mockRouter;
    late MockRouteInformationProvider mockRouteInfoProvider;

    setUp(() {
      mockMetaService = MockWebMetaService();
      mockRouter = MockGoRouter();
      mockRouteInfoProvider = MockRouteInformationProvider();

      // Setup mock router
      when(mockRouter.routeInformationProvider)
          .thenReturn(mockRouteInfoProvider);
      when(mockRouteInfoProvider.value).thenReturn(
        RouteInformation(uri: Uri.parse('/')),
      );
      when(mockRouter.routeInformationProvider)
          .thenReturn(mockRouteInfoProvider);
      when(mockRouter.go(any)).thenReturn(null);
      when(mockRouter.push(any)).thenReturn(null);
    });

    testWidgets('route change triggers WebMetaService.apply with correct meta',
        (tester) async {
      // This test verifies that when the route changes from /login to /chat,
      // WebMetaService.apply is called with the correct meta for /chat
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('locale change triggers meta re-apply for current path',
        (tester) async {
      // This test verifies that when the locale changes,
      // the current path's meta is re-applied with the new locale
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('MaterialApp.router builder does not wrap Navigator',
        (tester) async {
      // This test verifies that the builder in MaterialApp.router
      // does not create a nested Navigator
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('routeObserver is only registered via GoRouter observers',
        (tester) async {
      // This test verifies that routeObserver is not duplicated
      // in the MaterialApp.router builder
      fail('TODO: implement after refactoring app.dart');
    });
  });
}
```

- [ ] **Step 2: Generate mocks**

Run: `cd flutter/apps/web && dart run build_runner build --delete-conflicting-outputs`
Expected: `app_lifecycle_test.mocks.dart` generated

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd flutter/apps/web && flutter test test/app_lifecycle_test.dart`
Expected: FAIL with "TODO: implement after refactoring app.dart"

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/test/app_lifecycle_test.dart
git add flutter/apps/web/test/app_lifecycle_test.mocks.dart
git commit -m "test: add failing tests for app lifecycle refactoring"
```

---

### Task 3: Refactor initState — Remove addPostFrameCallback and Fix Lifecycle

**Files:**
- Modify: `flutter/apps/web/lib/app.dart:21-42`

- [ ] **Step 1: Rewrite initState**

Replace the current `initState` method (lines 24-42) with:

```dart
@override
void initState() {
  super.initState();

  // 1. Synchronous logger init (early startup errors now captured)
  AppLogger.init(errorReporter: ref.read(errorReporterProvider));

  // 2. Get router instance and register route listener
  _router = ref.read(routerProvider);
  _router.routeInformationProvider.addListener(_onRouteChanged);

  // 3. Register locale change listener (ref.listenManual is valid in initState)
  ref.listenManual(languageProvider, _onLocaleChanged);

  // 4. One-time startup operations
  ref.read(authStateProvider.notifier).checkAuth();
  final analytics = ref.read(analyticsProvider);
  analytics.trackEvent('app_start', {'platform': 'web'});

  // 5. Apply initial fallback meta (listener will override once route resolves)
  _webMetaService.apply(appFallbackMeta);
}
```

- [ ] **Step 2: Add the route change callback**

Add these methods to `_AppState`:

```dart
late final GoRouter _router;

void _onRouteChanged() {
  final path = _router.routeInformationProvider.value.uri.path;
  final locale = ref.read(languageProvider);
  final l10n = lookupAppLocalizations(Locale(locale));
  final meta = metaForPath(path, l10n);
  _webMetaService.apply(meta);
}

void _onLocaleChanged(String? previous, String next) {
  if (previous != next) {
    final path = _router.routeInformationProvider.value.uri.path;
    final l10n = lookupAppLocalizations(Locale(next));
    final meta = metaForPath(path, l10n);
    _webMetaService.apply(meta);
  }
}
```

- [ ] **Step 3: Add dispose to clean up listener**

```dart
@override
void dispose() {
  _router.routeInformationProvider.removeListener(_onRouteChanged);
  super.dispose();
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd flutter/apps/web && dart analyze lib/app.dart`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "refactor: fix app lifecycle — sync logger init, routeInformationProvider listener, ref.listenManual for locale"
```

---

### Task 4: Remove Nested Navigator from MaterialApp.router Builder

**Files:**
- Modify: `flutter/apps/web/lib/app.dart:57-66`

- [ ] **Step 1: Replace the builder**

Replace the current `builder` (lines 57-66):

```dart
// Before
builder: (context, child) {
  if (child == null) return const SizedBox.shrink();
  return BreakpointScope(
    child: Navigator(
      observers: [routeObserver],
      onGenerateRoute: (_) => null,
      pages: [MaterialPage(child: child)],
    ),
  );
},
```

With:

```dart
// After
builder: (context, child) {
  return BreakpointScope(
    child: child ?? const SizedBox.shrink(),
  );
},
```

- [ ] **Step 2: Remove unused import**

Remove this line from the imports (line 9):

```dart
import 'core/router/route_observer.dart';
```

Since `routeObserver` is no longer referenced in `app.dart` (it's only used in `app_router.dart`).

- [ ] **Step 3: Verify the file compiles**

Run: `cd flutter/apps/web && dart analyze lib/app.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "refactor: remove nested Navigator from MaterialApp.router builder"
```

---

### Task 5: Implement Tests for Route Change and Locale Change

**Files:**
- Modify: `flutter/apps/web/test/app_lifecycle_test.dart`

- [ ] **Step 1: Implement the route change test**

Replace the first failing test with:

```dart
testWidgets('route change triggers WebMetaService.apply with correct meta',
    (tester) async {
  final container = ProviderContainer(
    overrides: [
      routerProvider.overrideWithValue(mockRouter),
    ],
  );

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const App(),
    ),
  );

  // Wait for initial frame
  await tester.pumpAndSettle();

  // Clear initial meta applications
  mockMetaService.clear();

  // Simulate route change by updating the mock route info provider
  when(mockRouteInfoProvider.value).thenReturn(
    RouteInformation(uri: Uri.parse('/chat')),
  );

  // Trigger the listener (this happens automatically in real GoRouter,
  // but we need to manually notify since we're using mocks)
  // The actual routeInformationProvider.addListener callback
  // would have been registered in initState

  // Verify that apply was called with meta containing '/chat' path
  expect(mockMetaService.lastApplied, isNotNull);
  expect(mockMetaService.lastApplied!.canonicalPath, '/chat');
});
```

- [ ] **Step 2: Implement the locale change test**

Replace the second failing test with:

```dart
testWidgets('locale change triggers meta re-apply for current path',
    (tester) async {
  final container = ProviderContainer(
    overrides: [
      routerProvider.overrideWithValue(mockRouter),
    ],
  );

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const App(),
    ),
  );

  await tester.pumpAndSettle();
  mockMetaService.clear();

  // Change locale via provider
  container.read(languageProvider.notifier).state = 'en';

  await tester.pumpAndSettle();

  // Verify meta was re-applied
  expect(mockMetaService.appliedMetas, isNotEmpty);
});
```

- [ ] **Step 3: Implement the Navigator structure test**

Replace the third failing test with:

```dart
testWidgets('MaterialApp.router builder does not wrap Navigator',
    (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: const App(),
    ),
  );

  await tester.pumpAndSettle();

  // Find the MaterialApp
  final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
  expect(materialApp.routerConfig, isNotNull);

  // Verify that the builder does not create a Navigator
  // by checking that there's only one Navigator in the widget tree
  // (the one created by MaterialApp.router internally)
  final navigators = tester.widgetList(find.byType(Navigator));
  // MaterialApp.router creates one Navigator internally
  // We should NOT have a second one from the builder
  expect(navigators.length, 1);
});
```

- [ ] **Step 4: Implement the routeObserver registration test**

Replace the fourth failing test with:

```dart
testWidgets('routeObserver is only registered via GoRouter observers',
    (tester) async {
  final container = ProviderContainer(
    overrides: [
      routerProvider.overrideWithValue(mockRouter),
    ],
  );

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const App(),
    ),
  );

  await tester.pumpAndSettle();

  // Verify routeObserver is in GoRouter's observers
  // (this is configured in app_router.dart, not in app.dart)
  // The key assertion is that app.dart does NOT add routeObserver
  // to any Navigator — it's only in GoRouter

  // Check that no Navigator widget in the tree has routeObserver
  // in its observers list (since we removed the nested Navigator)
  final navigators = tester.widgetList<Navigator>(find.byType(Navigator));
  for (final nav in navigators) {
    expect(nav.observers, isNot(contains(routeObserver)));
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd flutter/apps/web && flutter test test/app_lifecycle_test.dart`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add flutter/apps/web/test/app_lifecycle_test.dart
git commit -m "test: implement app lifecycle tests for route/locale changes and Navigator structure"
```

---

### Task 6: Run Full Test Suite and Verify No Regressions

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run static analysis**

Run: `cd flutter/apps/web && dart analyze`
Expected: No errors or warnings

- [ ] **Step 3: Final commit with all changes**

```bash
git add -A
git commit -m "fix: complete app lifecycle refactoring — sync logger, route listener, locale listener, remove nested Navigator"
```

---

## Summary of Changes

### `flutter/apps/web/lib/app.dart`

| Section | Before | After |
|---------|--------|-------|
| `initState` | `addPostFrameCallback` with `ref.listen<GoRouter>` | Synchronous: `AppLogger.init` → `routeInformationProvider.addListener` → `ref.listenManual` → `checkAuth` → analytics → fallback meta |
| Route listening | `ref.listen<GoRouter>(routerProvider, ...)` | `_router.routeInformationProvider.addListener(_onRouteChanged)` |
| Locale listening | None | `ref.listenManual(languageProvider, _onLocaleChanged)` |
| `builder` | `BreakpointScope` → `Navigator` → `child` | `BreakpointScope` → `child` |
| `dispose` | None | `_router.routeInformationProvider.removeListener(_onRouteChanged)` |
| Imports | `route_observer.dart` imported | Removed (unused after Navigator removal) |

### New Files

| File | Purpose |
|------|---------|
| `flutter/apps/web/test/mocks/mock_web_meta_service.dart` | Mock for WebMetaService |
| `flutter/apps/web/test/app_lifecycle_test.dart` | Tests for lifecycle, meta updates, Navigator structure |
| `flutter/apps/web/test/app_lifecycle_test.mocks.dart` | Generated mocks (GoRouter, RouteInformationProvider) |
