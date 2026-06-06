# Flutter Deep Refactoring - Baseline Audit

> Generated: 2026-06-06
> Branch: `main`
> Purpose: Record the pre-refactoring state so we can verify nothing breaks.

---

## 1. Codebase Snapshot

| Module | Dart Files (lib/) |
|---|---|
| apps/desktop | 91 |
| apps/mobile | 90 |
| apps/web | 181 (NOT being refactored) |
| packages/core | 80 |
| packages/ui | 23 |

---

## 2. Flutter Analyze Results

### 2.1 packages/core -- No issues found

### 2.2 packages/ui -- No issues found

### 2.3 apps/desktop -- 901 issues (0 errors, 17 warnings, 884 info)

**Warnings (17):**

| Severity | Rule | File | Line |
|---|---|---|---|
| warning | inference_failure_on_function_invocation | adapters/desktop_network_adapter.dart | 166 |
| warning | inference_failure_on_function_invocation | adapters/desktop_network_adapter.dart | 187 |
| warning | strict_raw_type | features/chat/presentation/chat_notifier.dart | 26 |
| warning | strict_raw_type | features/chat/presentation/chat_notifier.dart | 27 |
| warning | dead_null_aware_expression | features/chat/presentation/widgets/message_bubble.dart | 18 |
| warning | inference_failure_on_function_invocation | features/chat/presentation/widgets/message_input.dart | 84 |
| warning | dead_null_aware_expression | features/contacts/presentation/contacts_page.dart | 59 |
| warning | dead_null_aware_expression | features/contacts/presentation/contacts_page.dart | 107 |
| warning | strict_raw_type | features/contacts/presentation/contacts_provider.dart | 50 |
| warning | strict_raw_type | features/e2ee/data/e2ee_api.dart | 44 |
| warning | inference_failure_on_collection_literal | features/e2ee/data/e2ee_api.dart | 133 |
| warning | inference_failure_on_collection_literal | features/group/data/group_api.dart | 50 |
| warning | inference_failure_on_collection_literal | features/group/data/group_api.dart | 58 |
| warning | invalid_use_of_visible_for_testing_member | features/settings/presentation/settings_page.dart | 36 |
| warning | invalid_use_of_protected_member | features/settings/presentation/settings_page.dart | 36 |
| warning | invalid_use_of_visible_for_testing_member | features/settings/presentation/settings_page.dart | 56 |
| warning | invalid_use_of_protected_member | features/settings/presentation/settings_page.dart | 56 |

Top info categories: `prefer_const_constructors`, `public_member_api_docs`, `directives_ordering`, `always_use_package_imports`, `require_trailing_commas`, `lines_longer_than_80_chars`, `deprecated_member_use`.

### 2.4 apps/mobile -- 299 issues (0 errors, 10 warnings, 289 info)

**Warnings (10):**

| Severity | Rule | File | Line |
|---|---|---|---|
| warning | strict_raw_type | features/chat/presentation/chat_notifier.dart | 26 |
| warning | strict_raw_type | features/chat/presentation/chat_notifier.dart | 27 |
| warning | inference_failure_on_function_invocation | features/chat/presentation/widgets/message_input.dart | 84 |
| warning | strict_raw_type | features/contacts/presentation/contacts_provider.dart | 50 |
| warning | strict_raw_type | features/e2ee/data/e2ee_api.dart | 44 |
| warning | inference_failure_on_collection_literal | features/e2ee/data/e2ee_api.dart | 133 |
| warning | inference_failure_on_collection_literal | features/group/data/group_api.dart | 50 |
| warning | inference_failure_on_collection_literal | features/group/data/group_api.dart | 58 |
| warning | inference_failure_on_function_invocation | features/settings/presentation/settings_page.dart | 124 |
| warning | unused_import | test/widget_test.dart | 3 |

---

## 3. Flutter Test Results

| Module | Tests | Status |
|---|---|---|
| packages/core | 181 | All passed |
| packages/ui | 52 | All passed |
| apps/desktop | 36 | All passed |
| apps/mobile | 1 | All passed |
| **Total** | **270** | **All passed** |

---

## 4. Desktop vs. Mobile Feature File Classification

All 61 `.dart` files under `apps/desktop/lib/features/` compared against their mobile counterparts.

### Summary

| Category | Count | Description |
|---|---|---|
| IDENTICAL | 44 | Files are byte-identical between desktop and mobile |
| TRIVIAL (1-4 diff lines) | 7 | Minor differences (package import style, trailing whitespace) |
| REAL (>4 diff lines) | 10 | Substantive platform-specific differences |
| ONLY_DESKTOP | 0 | No desktop-only feature files |
| **Total** | **61** | |

### REAL differences (require platform abstraction)

| Diff Lines | Desktop File | Notes |
|---|---|---|
| 8 | chat/presentation/chat_notifier.dart | Minor logic divergence |
| 196 | chat/presentation/widgets/message_bubble.dart | Heavily diverged UI widget |
| 73 | contacts/presentation/contacts_page.dart | Platform-specific layout |
| 75 | e2ee/data/desktop_key_store.dart | Platform-specific key store impl |
| 148 | e2ee/data/desktop_session_store.dart | Platform-specific session store impl |
| 8 | e2ee/data/e2ee_manager.dart | Minor logic divergence |
| 120 | moments/presentation/widgets/post_card.dart | Heavily diverged UI widget |
| 5 | settings/presentation/ai_settings_provider.dart | Minor provider divergence |
| 69 | settings/presentation/settings_page.dart | Platform-specific settings UI |
| 5 | settings/presentation/settings_provider.dart | Minor provider divergence |

### TRIVIAL differences (safe to unify as-is)

| Diff Lines | Desktop File |
|---|---|
| 2 | auth/presentation/login_page.dart |
| 2 | chat/chat.dart |
| 2 | e2ee/data/e2ee_providers.dart |
| 2 | e2ee/presentation/e2ee_provider.dart |
| 2 | e2ee/presentation/encryption_badge.dart |
| 2 | e2ee/presentation/encryption_banner.dart |
| 2 | e2ee/presentation/negotiation_dialog.dart |

---

## 5. Router Import Comparison

### Desktop (`apps/desktop/lib/core/router/app_router.dart`)

```dart
import 'package:im_desktop/features/auth/auth.dart';
import 'package:im_desktop/features/chat/chat.dart';
import 'package:im_desktop/features/contacts/contacts.dart';
import 'package:im_desktop/features/group/group.dart';
import 'package:im_desktop/features/settings/settings.dart';
import 'package:im_desktop/features/moments/moments.dart';
```

Uses `package:` imports (6 features).

### Mobile (`apps/mobile/lib/core/router/app_router.dart`)

```dart
import '../../features/auth/auth.dart';
import '../../features/chat/chat.dart';
import '../../features/contacts/contacts.dart';
import '../../features/group/group.dart';
import '../../features/moments/moments.dart';
import '../../features/settings/settings.dart';
```

Uses relative imports (6 features).

Both routers import the same 6 feature modules. Import style differs (package vs relative) but feature scope is identical.

---

## 6. E2EE Provider Dependencies (CRITICAL FINDING)

Both desktop and mobile `e2ee_providers.dart` are **byte-identical** and both reference:

```dart
import 'desktop_key_store.dart';
import 'desktop_session_store.dart';

// ...
final store = DesktopKeyStore();
final store = DesktopSessionStore();
```

**This means mobile is using `DesktopKeyStore` and `DesktopSessionStore` -- classes named after the desktop platform.** Mobile even has copies of these files at:
- `apps/mobile/lib/features/e2ee/data/desktop_key_store.dart`
- `apps/mobile/lib/features/e2ee/data/desktop_session_store.dart`

This is a naming/abstraction issue that should be addressed during refactoring: these stores should either be renamed to platform-agnostic names or properly abstracted through the `E2eeKeyStore`/`E2eeSessionStore` interfaces.

---

## 7. Refactoring Branch

Current branch is `main`. The refactoring work should be done on a dedicated feature branch created from `main`.

---

## 8. Risk Areas for Refactoring

1. **`message_bubble.dart`** -- 196 diff lines between desktop/mobile. This is the most divergent shared widget. Needs careful platform-aware abstraction.
2. **`post_card.dart`** -- 120 diff lines. Second most divergent widget.
3. **`contacts_page.dart`** -- 73 diff lines. Platform-specific layout differences.
4. **`settings_page.dart`** -- 69 diff lines. Platform-specific settings UI.
5. **E2EE stores** -- Naming issue: mobile uses "desktop" named classes. Refactoring should introduce proper platform abstraction.
6. **901 analyze issues in desktop** -- Pre-existing tech debt. The refactoring should not introduce new issues but fixing all 901 is out of scope for this phase.
7. **All 270 tests pass** -- This is the safety net. Any regression must be caught by existing tests or new tests added during refactoring.
