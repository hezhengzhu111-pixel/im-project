# Third-Party Service Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish unified abstraction layer for analytics, error reporting, payments, maps, push, and file preview services following Ports & Adapters architecture.

**Architecture:** Abstract ports in `packages/core/lib/src/services/`, Noop implementations in both core (for tests) and `apps/web/lib/adapters/services/` (for runtime), compile-time config via `--dart-define`, Riverpod DI wiring, event tracking in auth/chat/ws lifecycle.

**Tech Stack:** Dart, Flutter, Riverpod, Freezed, very_good_analysis

---

## File Structure

```
packages/core/lib/src/services/
  models.dart              # PaymentResult, PaymentRequest, GeoResult, GeoBounds, PushMessage, FilePreviewRequest, MapConfig, AnalyticsEvent
  analytics_port.dart      # Abstract AnalyticsPort
  error_reporter_port.dart # Abstract ErrorReporterPort
  payment_port.dart        # Abstract PaymentPort
  map_port.dart            # Abstract MapPort
  push_port.dart           # Abstract PushPort
  file_preview_port.dart   # Abstract FilePreviewPort
  services.dart            # Barrel export

packages/core/lib/src/config/
  app_config.dart          # AppConfig with fromEnvironment()

packages/core/test/services/
  noop_analytics_adapter_test.dart
  noop_error_reporter_adapter_test.dart
  noop_push_adapter_test.dart

apps/web/lib/adapters/services/
  noop_analytics_adapter.dart
  noop_error_reporter_adapter.dart
  noop_push_adapter.dart
  noop_payment_adapter.dart
  noop_map_adapter.dart
  noop_file_preview_adapter.dart
  services.dart            # Barrel export

apps/web/lib/core/di/providers.dart  # Add service providers
apps/web/lib/features/auth/presentation/auth_provider.dart  # Add event tracking
apps/web/lib/features/chat/presentation/chat_provider.dart  # Add event tracking
apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart  # Add event tracking
apps/web/lib/app.dart  # Add app_start event
```

---

### Task 1: Core Service Models

**Files:**
- Create: `packages/core/lib/src/services/models.dart`
- Create: `packages/core/test/services/models_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// packages/core/test/services/models_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/src/services/models.dart';

void main() {
  group('AnalyticsEvent', () {
    test('creates with name and timestamp', () {
      final event = AnalyticsEvent(name: 'test_event');
      expect(event.name, 'test_event');
      expect(event.timestamp, isA<DateTime>());
      expect(event.properties, isNull);
    });

    test('creates with properties', () {
      final event = AnalyticsEvent(
        name: 'login_success',
        properties: {'method': 'password'},
      );
      expect(event.properties, {'method': 'password'});
    });
  });

  group('PaymentRequest', () {
    test('creates with required fields', () {
      final request = PaymentRequest(
        productId: 'premium_monthly',
        price: 9.99,
        currency: 'USD',
      );
      expect(request.productId, 'premium_monthly');
      expect(request.price, 9.99);
      expect(request.currency, 'USD');
    });
  });

  group('PaymentResult', () {
    test('creates success result', () {
      final result = PaymentResult(
        success: true,
        transactionId: 'txn_123',
      );
      expect(result.success, true);
      expect(result.transactionId, 'txn_123');
    });

    test('creates failure result', () {
      final result = PaymentResult(
        success: false,
        error: 'Card declined',
      );
      expect(result.success, false);
      expect(result.error, 'Card declined');
    });
  });

  group('GeoResult', () {
    test('creates with address and coordinates', () {
      final result = GeoResult(
        address: '123 Main St',
        latitude: 37.7749,
        longitude: -122.4194,
      );
      expect(result.address, '123 Main St');
      expect(result.latitude, 37.7749);
      expect(result.longitude, -122.4194);
    });
  });

  group('PushMessage', () {
    test('creates with title and body', () {
      final message = PushMessage(
        title: 'New Message',
        body: 'You have a new message from Alice',
        data: {'conversationId': 'conv_123'},
      );
      expect(message.title, 'New Message');
      expect(message.body, 'You have a new message from Alice');
      expect(message.data, {'conversationId': 'conv_123'});
    });
  });

  group('FilePreviewRequest', () {
    test('creates with file info', () {
      final request = FilePreviewRequest(
        url: 'https://example.com/file.pdf',
        mimeType: 'application/pdf',
        fileName: 'document.pdf',
      );
      expect(request.url, 'https://example.com/file.pdf');
      expect(request.mimeType, 'application/pdf');
      expect(request.fileName, 'document.pdf');
    });
  });

  group('MapConfig', () {
    test('creates with center and zoom', () {
      final config = MapConfig(
        center: GeoResult(
          address: 'San Francisco',
          latitude: 37.7749,
          longitude: -122.4194,
        ),
        zoom: 12,
      );
      expect(config.center.latitude, 37.7749);
      expect(config.zoom, 12);
    });
  });

  group('GeoBounds', () {
    test('creates with southwest and northeast', () {
      final bounds = GeoBounds(
        southwest: GeoResult(address: '', latitude: 37.7, longitude: -122.5),
        northeast: GeoResult(address: '', latitude: 37.8, longitude: -122.4),
      );
      expect(bounds.southwest.latitude, 37.7);
      expect(bounds.northeast.latitude, 37.8);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && dart test test/services/models_test.dart`
Expected: FAIL with "Target of URI doesn't exist: 'package:im_core/src/services/models.dart'"

- [ ] **Step 3: Write the implementation**

```dart
// packages/core/lib/src/services/models.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'models.freezed.dart';
part 'models.g.dart';

class AnalyticsEvent {
  const AnalyticsEvent({
    required this.name,
    DateTime? timestamp,
    this.properties,
  }) : timestamp = timestamp ?? DateTime.now();

  final String name;
  final DateTime timestamp;
  final Map<String, dynamic>? properties;
}

@freezed
class PaymentRequest with _$PaymentRequest {
  const factory PaymentRequest({
    required String productId,
    required double price,
    required String currency,
    Map<String, dynamic>? metadata,
  }) = _PaymentRequest;

  factory PaymentRequest.fromJson(Map<String, dynamic> json) =>
      _$PaymentRequestFromJson(json);
}

@freezed
class PaymentResult with _$PaymentResult {
  const factory PaymentResult({
    required bool success,
    String? transactionId,
    String? error,
  }) = _PaymentResult;

  factory PaymentResult.fromJson(Map<String, dynamic> json) =>
      _$PaymentResultFromJson(json);
}

@freezed
class PurchaseHistory with _$PurchaseHistory {
  const factory PurchaseHistory({
    required String transactionId,
    required String productId,
    required DateTime timestamp,
    required double amount,
    required String currency,
  }) = _PurchaseHistory;

  factory PurchaseHistory.fromJson(Map<String, dynamic> json) =>
      _$PurchaseHistoryFromJson(json);
}

@freezed
class GeoResult with _$GeoResult {
  const factory GeoResult({
    required String address,
    required double latitude,
    required double longitude,
  }) = _GeoResult;

  factory GeoResult.fromJson(Map<String, dynamic> json) =>
      _$GeoResultFromJson(json);
}

@freezed
class GeoBounds with _$GeoBounds {
  const factory GeoBounds({
    required GeoResult southwest,
    required GeoResult northeast,
  }) = _GeoBounds;

  factory GeoBounds.fromJson(Map<String, dynamic> json) =>
      _$GeoBoundsFromJson(json);
}

@freezed
class PushMessage with _$PushMessage {
  const factory PushMessage({
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) = _PushMessage;

  factory PushMessage.fromJson(Map<String, dynamic> json) =>
      _$PushMessageFromJson(json);
}

@freezed
class FilePreviewRequest with _$FilePreviewRequest {
  const factory FilePreviewRequest({
    required String url,
    required String mimeType,
    required String fileName,
  }) = _FilePreviewRequest;

  factory FilePreviewRequest.fromJson(Map<String, dynamic> json) =>
      _$FilePreviewRequestFromJson(json);
}

@freezed
class MapConfig with _$MapConfig {
  const factory MapConfig({
    required GeoResult center,
    @Default(10) double zoom,
    @Default(false) bool showMyLocation,
  }) = _MapConfig;

  factory MapConfig.fromJson(Map<String, dynamic> json) =>
      _$MapConfigFromJson(json);
}
```

- [ ] **Step 4: Run build_runner to generate freezed code**

Run: `cd packages/core && dart run build_runner build --delete-conflicting-outputs`
Expected: Generates `models.freezed.dart` and `models.g.dart`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && dart test test/services/models_test.dart`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/lib/src/services/models.dart packages/core/test/services/models_test.dart packages/core/lib/src/services/models.freezed.dart packages/core/lib/src/services/models.g.dart
git commit -m "feat(core): add service abstraction models (PaymentResult, GeoResult, PushMessage, etc.)"
```

---

### Task 2: AnalyticsPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/analytics_port.dart`
- Create: `apps/web/lib/adapters/services/noop_analytics_adapter.dart`
- Create: `packages/core/test/services/analytics_port_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// packages/core/test/services/analytics_port_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/src/services/analytics_port.dart';

class _TestAnalyticsAdapter implements AnalyticsPort {
  final List<AnalyticsCall> calls = [];

  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    calls.add(AnalyticsCall('trackEvent', eventName, properties));
  }

  @override
  void setUserId(String? userId) {
    calls.add(AnalyticsCall('setUserId', userId, null));
  }

  @override
  void setUserProperties(Map<String, dynamic> properties) {
    calls.add(AnalyticsCall('setUserProperties', null, properties));
  }
}

class AnalyticsCall {
  final String method;
  final String? eventName;
  final Map<String, dynamic>? properties;
  AnalyticsCall(this.method, this.eventName, this.properties);
}

void main() {
  test('AnalyticsPort interface can be implemented', () {
    final adapter = _TestAnalyticsAdapter();
    adapter.trackEvent('test_event', {'key': 'value'});
    adapter.setUserId('user_123');
    adapter.setUserProperties({'plan': 'premium'});

    expect(adapter.calls.length, 3);
    expect(adapter.calls[0].method, 'trackEvent');
    expect(adapter.calls[0].eventName, 'test_event');
    expect(adapter.calls[1].method, 'setUserId');
    expect(adapter.calls[1].eventName, 'user_123');
    expect(adapter.calls[2].method, 'setUserProperties');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && dart test test/services/analytics_port_test.dart`
Expected: FAIL with "Target of URI doesn't exist"

- [ ] **Step 3: Write the implementation**

```dart
// packages/core/lib/src/services/analytics_port.dart
/// Abstract port for analytics/tracking services.
///
/// Implementations should send events to analytics providers
/// (e.g., Firebase Analytics, Mixpanel, Amplitude).
/// All methods must be safe to call from any thread.
abstract class AnalyticsPort {
  /// Track a named event with optional properties.
  /// Properties must NOT contain PII (tokens, emails, phone numbers).
  void trackEvent(String eventName, [Map<String, dynamic>? properties]);

  /// Set the current user ID for event attribution.
  /// Pass null to clear the user ID (e.g., on logout).
  void setUserId(String? userId);

  /// Set user properties for segmentation.
  /// Properties must NOT contain PII.
  void setUserProperties(Map<String, dynamic> properties);
}

/// Noop implementation that discards all events.
/// Use in tests and local development.
class NoopAnalyticsPort implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && dart test test/services/analytics_port_test.dart`
Expected: PASS

- [ ] **Step 5: Write web adapter (same Noop for now)**

```dart
// apps/web/lib/adapters/services/noop_analytics_adapter.dart
import 'package:im_core/im_core.dart';

/// Web adapter for analytics. Currently Noop.
/// Replace with real SDK (e.g., Firebase Analytics) when ready.
class NoopAnalyticsAdapter implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/lib/src/services/analytics_port.dart packages/core/test/services/analytics_port_test.dart apps/web/lib/adapters/services/noop_analytics_adapter.dart
git commit -m "feat(core): add AnalyticsPort with Noop implementation"
```

---

### Task 3: ErrorReporterPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/error_reporter_port.dart`
- Create: `apps/web/lib/adapters/services/noop_error_reporter_adapter.dart`
- Create: `packages/core/test/services/error_reporter_port_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// packages/core/test/services/error_reporter_port_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/src/services/error_reporter_port.dart';

class _TestErrorReporterAdapter implements ErrorReporterPort {
  final List<ErrorCall> calls = [];

  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {
    calls.add(ErrorCall('reportError', error.toString(), stackTrace, extra));
  }

  @override
  void reportMessage(String message, {String? level}) {
    calls.add(ErrorCall('reportMessage', message, null, {'level': level}));
  }
}

class ErrorCall {
  final String method;
  final String message;
  final StackTrace? stackTrace;
  final Map<String, dynamic>? extra;
  ErrorCall(this.method, this.message, this.stackTrace, this.extra);
}

void main() {
  test('ErrorReporterPort interface can be implemented', () {
    final adapter = _TestErrorReporterAdapter();
    adapter.reportError(Exception('test'), StackTrace.current, extra: {'key': 'value'});
    adapter.reportMessage('info message', level: 'info');

    expect(adapter.calls.length, 2);
    expect(adapter.calls[0].method, 'reportError');
    expect(adapter.calls[0].message, 'Exception: test');
    expect(adapter.calls[1].method, 'reportMessage');
    expect(adapter.calls[1].extra?['level'], 'info');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && dart test test/services/error_reporter_port_test.dart`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```dart
// packages/core/lib/src/services/error_reporter_port.dart
/// Abstract port for error/crash reporting services.
///
/// Implementations should send errors to providers like Sentry, Bugsnag, or Crashlytics.
/// Never include sensitive data (tokens, PII) in reports.
abstract class ErrorReporterPort {
  /// Report an exception with optional stack trace and extra context.
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra});

  /// Report a non-exception message (e.g., warning, info).
  void reportMessage(String message, {String? level});
}

/// Noop implementation that discards all reports.
class NoopErrorReporterPort implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && dart test test/services/error_reporter_port_test.dart`
Expected: PASS

- [ ] **Step 5: Write web adapter**

```dart
// apps/web/lib/adapters/services/noop_error_reporter_adapter.dart
import 'package:im_core/im_core.dart';

/// Web adapter for error reporting. Currently Noop.
/// Replace with real SDK (e.g., Sentry) when ready.
class NoopErrorReporterAdapter implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/lib/src/services/error_reporter_port.dart packages/core/test/services/error_reporter_port_test.dart apps/web/lib/adapters/services/noop_error_reporter_adapter.dart
git commit -m "feat(core): add ErrorReporterPort with Noop implementation"
```

---

### Task 4: PushPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/push_port.dart`
- Create: `apps/web/lib/adapters/services/noop_push_adapter.dart`
- Create: `packages/core/test/services/push_port_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// packages/core/test/services/push_port_test.dart
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/src/services/push_port.dart';
import 'package:im_core/src/services/models.dart';

class _TestPushAdapter implements PushPort {
  final _controller = StreamController<PushMessage>.broadcast();
  bool subscribeCalled = false;
  bool unsubscribeCalled = false;

  @override
  Future<String?> subscribe() async {
    subscribeCalled = true;
    return 'test_token';
  }

  @override
  Future<void> unsubscribe() async {
    unsubscribeCalled = true;
  }

  @override
  Stream<PushMessage> get onMessage => _controller.stream;

  void dispose() => _controller.close();
}

void main() {
  test('PushPort interface can be implemented', () async {
    final adapter = _TestPushAdapter();
    final token = await adapter.subscribe();
    expect(token, 'test_token');
    expect(adapter.subscribeCalled, true);

    await adapter.unsubscribe();
    expect(adapter.unsubscribeCalled, true);

    adapter.dispose();
  });

  test('PushPort onMessage streams messages', () async {
    final adapter = _TestPushAdapter();
    final messages = <PushMessage>[];
    adapter.onMessage.listen(messages.add);

    adapter._controller.add(const PushMessage(
      title: 'Test',
      body: 'Hello',
    ));

    await Future.delayed(Duration.zero);
    expect(messages.length, 1);
    expect(messages[0].title, 'Test');

    adapter.dispose();
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && dart test test/services/push_port_test.dart`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```dart
// packages/core/lib/src/services/push_port.dart
import 'dart:async';
import 'models.dart';

/// Abstract port for push notification services.
///
/// Implementations should handle platform-specific push registration
/// (e.g., Web Push API, FCM, APNs).
abstract class PushPort {
  /// Subscribe to push notifications.
  /// Returns the device token, or null if subscription failed.
  Future<String?> subscribe();

  /// Unsubscribe from push notifications.
  Future<void> unsubscribe();

  /// Stream of incoming push messages.
  Stream<PushMessage> get onMessage;
}

/// Noop implementation that never subscribes and never receives messages.
class NoopPushPort implements PushPort {
  final _controller = StreamController<PushMessage>.broadcast();

  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => _controller.stream;

  void dispose() => _controller.close();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && dart test test/services/push_port_test.dart`
Expected: PASS

- [ ] **Step 5: Write web adapter**

```dart
// apps/web/lib/adapters/services/noop_push_adapter.dart
import 'dart:async';
import 'package:im_core/im_core.dart';

/// Web adapter for push notifications. Currently Noop.
/// Replace with Web Push API or FCM SDK when ready.
class NoopPushAdapter implements PushPort {
  final _controller = StreamController<PushMessage>.broadcast();

  @override
  Future<String?> subscribe() async => null;

  @override
  Future<void> unsubscribe() async {}

  @override
  Stream<PushMessage> get onMessage => _controller.stream;

  void dispose() => _controller.close();
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/lib/src/services/push_port.dart packages/core/test/services/push_port_test.dart apps/web/lib/adapters/services/noop_push_adapter.dart
git commit -m "feat(core): add PushPort with Noop implementation"
```

---

### Task 5: PaymentPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/payment_port.dart`
- Create: `apps/web/lib/adapters/services/noop_payment_adapter.dart`

- [ ] **Step 1: Write the implementation**

```dart
// packages/core/lib/src/services/payment_port.dart
import 'models.dart';

/// Abstract port for payment processing services.
///
/// Implementations should handle platform-specific payment flows
/// (e.g., Stripe, IAP, Google Play Billing).
abstract class PaymentPort {
  /// Initiate a purchase.
  /// Returns PaymentResult with success status and transaction ID.
  Future<PaymentResult> purchase(PaymentRequest request);

  /// Get purchase history for the current user.
  Future<List<PurchaseHistory>> getPurchaseHistory();
}

/// Noop implementation that always fails with "not available".
class NoopPaymentPort implements PaymentPort {
  @override
  Future<PaymentResult> purchase(PaymentRequest request) async {
    return const PaymentResult(
      success: false,
      error: 'Payment not available in this environment',
    );
  }

  @override
  Future<List<PurchaseHistory>> getPurchaseHistory() async => [];
}
```

- [ ] **Step 2: Write web adapter**

```dart
// apps/web/lib/adapters/services/noop_payment_adapter.dart
import 'package:im_core/im_core.dart';

/// Web adapter for payments. Currently Noop.
/// Replace with Stripe or other payment SDK when ready.
class NoopPaymentAdapter implements PaymentPort {
  @override
  Future<PaymentResult> purchase(PaymentRequest request) async {
    return const PaymentResult(
      success: false,
      error: 'Payment not available in this environment',
    );
  }

  @override
  Future<List<PurchaseHistory>> getPurchaseHistory() async => [];
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/lib/src/services/payment_port.dart apps/web/lib/adapters/services/noop_payment_adapter.dart
git commit -m "feat(core): add PaymentPort with Noop implementation"
```

---

### Task 6: MapPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/map_port.dart`
- Create: `apps/web/lib/adapters/services/noop_map_adapter.dart`

- [ ] **Step 1: Write the implementation**

```dart
// packages/core/lib/src/services/map_port.dart
import 'models.dart';

/// Abstract port for map/geocoding services.
///
/// Note: packages/core is pure Dart (no Flutter dependency).
/// Map widget rendering lives in platform adapters.
abstract class MapPort {
  /// Geocode an address to coordinates.
  Future<GeoResult> geocode(String address);

  /// Search for places matching a query within optional bounds.
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds);
}

/// Noop implementation that returns empty results.
class NoopMapPort implements MapPort {
  @override
  Future<GeoResult> geocode(String address) async {
    return const GeoResult(
      address: '',
      latitude: 0,
      longitude: 0,
    );
  }

  @override
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds) async => [];
}
```

- [ ] **Step 2: Write web adapter**

```dart
// apps/web/lib/adapters/services/noop_map_adapter.dart
import 'package:im_core/im_core.dart';

/// Web adapter for maps. Currently Noop.
/// Replace with Google Maps SDK when ready.
class NoopMapAdapter implements MapPort {
  @override
  Future<GeoResult> geocode(String address) async {
    return const GeoResult(
      address: '',
      latitude: 0,
      longitude: 0,
    );
  }

  @override
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds) async => [];
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/lib/src/services/map_port.dart apps/web/lib/adapters/services/noop_map_adapter.dart
git commit -m "feat(core): add MapPort with Noop implementation"
```

---

### Task 7: FilePreviewPort + Noop

**Files:**
- Create: `packages/core/lib/src/services/file_preview_port.dart`
- Create: `apps/web/lib/adapters/services/noop_file_preview_adapter.dart`

- [ ] **Step 1: Write the implementation**

```dart
// packages/core/lib/src/services/file_preview_port.dart
import 'models.dart';

/// Abstract port for file preview services.
///
/// Implementations handle platform-specific file preview
/// (e.g., browser-native for web, native viewers for mobile).
abstract class FilePreviewPort {
  /// Check if a MIME type can be previewed.
  bool canPreview(String mimeType);

  /// Open a file preview for the given request.
  void openPreview(FilePreviewRequest request);
}

/// Noop implementation that reports nothing as previewable.
class NoopFilePreviewPort implements FilePreviewPort {
  @override
  bool canPreview(String mimeType) => false;

  @override
  void openPreview(FilePreviewRequest request) {}
}
```

- [ ] **Step 2: Write web adapter**

```dart
// apps/web/lib/adapters/services/noop_file_preview_adapter.dart
import 'package:im_core/im_core.dart';

/// Web adapter for file preview. Currently Noop.
/// Replace with browser-native preview logic when ready.
class NoopFilePreviewAdapter implements FilePreviewPort {
  @override
  bool canPreview(String mimeType) => false;

  @override
  void openPreview(FilePreviewRequest request) {}
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/lib/src/services/file_preview_port.dart apps/web/lib/adapters/services/noop_file_preview_adapter.dart
git commit -m "feat(core): add FilePreviewPort with Noop implementation"
```

---

### Task 8: Barrel Exports + AppConfig

**Files:**
- Create: `packages/core/lib/src/services/services.dart`
- Create: `packages/core/lib/src/config/app_config.dart`
- Modify: `packages/core/lib/core.dart`
- Create: `packages/core/test/config/app_config_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// packages/core/test/config/app_config_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/src/config/app_config.dart';

void main() {
  test('AppConfig defaults to all disabled', () {
    const config = AppConfig();
    expect(config.analyticsEnabled, false);
    expect(config.errorReporterEnabled, false);
    expect(config.paymentEnabled, false);
    expect(config.mapEnabled, false);
    expect(config.pushEnabled, false);
    expect(config.filePreviewEnabled, false);
  });

  test('AppConfig can be constructed with specific flags', () {
    const config = AppConfig(
      analyticsEnabled: true,
      pushEnabled: true,
    );
    expect(config.analyticsEnabled, true);
    expect(config.pushEnabled, true);
    expect(config.errorReporterEnabled, false);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && dart test test/config/app_config_test.dart`
Expected: FAIL

- [ ] **Step 3: Write the barrel export**

```dart
// packages/core/lib/src/services/services.dart
export 'analytics_port.dart';
export 'error_reporter_port.dart';
export 'file_preview_port.dart';
export 'map_port.dart';
export 'models.dart';
export 'payment_port.dart';
export 'push_port.dart';
```

- [ ] **Step 4: Write AppConfig**

```dart
// packages/core/lib/src/config/app_config.dart
/// Compile-time configuration for third-party service enablement.
///
/// Configure via --dart-define at build time:
///   flutter run --dart-define=ANALYTICS_ENABLED=true
class AppConfig {
  final bool analyticsEnabled;
  final bool errorReporterEnabled;
  final bool paymentEnabled;
  final bool mapEnabled;
  final bool pushEnabled;
  final bool filePreviewEnabled;

  const AppConfig({
    this.analyticsEnabled = false,
    this.errorReporterEnabled = false,
    this.paymentEnabled = false,
    this.mapEnabled = false,
    this.pushEnabled = false,
    this.filePreviewEnabled = false,
  });

  /// Read configuration from compile-time environment variables.
  static AppConfig fromEnvironment() {
    return AppConfig(
      analyticsEnabled: const bool.fromEnvironment('ANALYTICS_ENABLED'),
      errorReporterEnabled: const bool.fromEnvironment('ERROR_REPORTER_ENABLED'),
      paymentEnabled: const bool.fromEnvironment('PAYMENT_ENABLED'),
      mapEnabled: const bool.fromEnvironment('MAP_ENABLED'),
      pushEnabled: const bool.fromEnvironment('PUSH_ENABLED'),
      filePreviewEnabled: const bool.fromEnvironment('FILE_PREVIEW_ENABLED'),
    );
  }
}
```

- [ ] **Step 5: Update core.dart barrel export**

```dart
// packages/core/lib/core.dart
library im_core;

export 'src/models/models.dart';
export 'src/contracts/contracts.dart';
export 'src/contracts/msg_type.dart';
export 'src/network/network.dart';
export 'src/storage/storage.dart';
export 'src/auth/auth.dart';
export 'src/im/im.dart';
export 'src/ws/ws.dart';
export 'src/utils/utils.dart';
export 'src/crypto/crypto.dart';
export 'src/services/services.dart';
export 'src/config/app_config.dart';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/core && dart test test/config/app_config_test.dart`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/lib/src/services/services.dart packages/core/lib/src/config/app_config.dart packages/core/lib/core.dart packages/core/test/config/app_config_test.dart
git commit -m "feat(core): add AppConfig and service barrel exports"
```

---

### Task 9: DI Wiring in providers.dart

**Files:**
- Modify: `apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: Add service providers**

Add the following to `apps/web/lib/core/di/providers.dart` after the existing imports:

```dart
// Add to imports at top of file:
import '../../adapters/services/noop_analytics_adapter.dart';
import '../../adapters/services/noop_error_reporter_adapter.dart';
import '../../adapters/services/noop_push_adapter.dart';
import '../../adapters/services/noop_payment_adapter.dart';
import '../../adapters/services/noop_map_adapter.dart';
import '../../adapters/services/noop_file_preview_adapter.dart';
```

Add the following providers after the existing `// E2EE` section:

```dart
// Third-party Services
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

final analyticsProvider = Provider<AnalyticsPort>((ref) {
  return ref.watch(appConfigProvider).analyticsEnabled
      ? NoopAnalyticsAdapter() // Replace with real adapter when ready
      : NoopAnalyticsAdapter();
});

final errorReporterProvider = Provider<ErrorReporterPort>((ref) {
  return ref.watch(appConfigProvider).errorReporterEnabled
      ? NoopErrorReporterAdapter() // Replace with real adapter when ready
      : NoopErrorReporterAdapter();
});

final pushProvider = Provider<PushPort>((ref) {
  return ref.watch(appConfigProvider).pushEnabled
      ? NoopPushAdapter() // Replace with real adapter when ready
      : NoopPushAdapter();
});

final paymentProvider = Provider<PaymentPort>((ref) {
  return ref.watch(appConfigProvider).paymentEnabled
      ? NoopPaymentAdapter() // Replace with real adapter when ready
      : NoopPaymentAdapter();
});

final mapProvider = Provider<MapPort>((ref) {
  return ref.watch(appConfigProvider).mapEnabled
      ? NoopMapAdapter() // Replace with real adapter when ready
      : NoopMapAdapter();
});

final filePreviewProvider = Provider<FilePreviewPort>((ref) {
  return ref.watch(appConfigProvider).filePreviewEnabled
      ? NoopFilePreviewAdapter() // Replace with real adapter when ready
      : NoopFilePreviewAdapter();
});
```

- [ ] **Step 2: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(web): add third-party service providers to DI"
```

---

### Task 10: Event Tracking in Auth

**Files:**
- Modify: `apps/web/lib/features/auth/presentation/auth_provider.dart`

- [ ] **Step 1: Add analytics tracking to login**

Add import at top of `auth_provider.dart`:
```dart
import '../../../core/di/providers.dart';
```

Note: Since `AuthNotifier` is created via `StateNotifierProvider`, we need to pass analytics as a constructor parameter. Update the constructor and provider:

In `auth_provider.dart`, modify `AuthNotifier`:

```dart
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient, this._httpClient, this._analytics)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

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
      _analytics.trackEvent('login_success', {'method': 'password'});
      _connectWs();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      _analytics.trackEvent('login_failed', {'error_type': 'auth'});
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
      _analytics.trackEvent('register_success');
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      _analytics.trackEvent('register_failed', {'error_type': 'auth'});
    }
  }

  Future<void> logout() async {
    _wsClient.disconnect();
    await _repository.logout();
    _analytics.setUserId(null);
    state = const AuthState();
  }

  Future<void> checkAuth() async {
    final isAuth = await _repository.isAuthenticated();
    if (isAuth) {
      try {
        final user = await _repository.getProfile();
        state = AuthState(user: user, isAuthenticated: true);
        _analytics.setUserId(user.id);
        _connectWs();
      } catch (e) {
        state = const AuthState();
      }
    }
  }
  // ... rest of class unchanged
}
```

In `providers.dart`, update the provider to pass analytics:

```dart
final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(wsClientProvider),
    ref.watch(httpClientProvider),
    ref.watch(analyticsProvider),
  );
});
```

- [ ] **Step 2: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/auth_provider.dart flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(web): add analytics tracking to auth flow"
```

---

### Task 11: Event Tracking in Chat

**Files:**
- Modify: `apps/web/lib/features/chat/presentation/chat_provider.dart`
- Modify: `apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart`

- [ ] **Step 1: Add analytics to ChatNotifier**

In `chat_provider.dart`, add import and modify constructor:

```dart
import 'package:im_core/im_core.dart';
import '../../../core/di/providers.dart';
```

Modify `ChatNotifier` constructor to accept `AnalyticsPort`:

```dart
class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(
    this._messageApi,
    this._pipeline,
    this._wsClient,
    this._currentUserId,
    this._e2eeManager,
    this._e2eeMetaStore,
    this._analytics,
  ) : super(const ChatState()) {
    _subscribeToWs();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  final String Function() _currentUserId;
  final E2eeManager _e2eeManager;
  final E2eeMetaStore _e2eeMetaStore;
  final AnalyticsPort _analytics;
```

Add tracking to `sendMessage` success/failure (around line 416-422):

```dart
      _replaceMessage(receiverId, cid, serverMessage);
      _analytics.trackEvent('message_send', {
        'type': messageType,
        'encrypted': e2eeStatus == 'encrypted',
      });
      return serverMessage;
    } catch (e) {
      print('Send message failed: $e');
      _updateMessageStatus(receiverId, cid, 'FAILED');
      _analytics.trackEvent('message_send_failed');
      return null;
    }
```

Do the same for `sendGroupMessage` (around line 450-456):

```dart
      _replaceMessage(groupId, cid, serverMessage);
      _analytics.trackEvent('message_send', {
        'type': messageType,
        'encrypted': false,
      });
      return serverMessage;
    } catch (e) {
      _updateMessageStatus(groupId, cid, 'FAILED');
      _analytics.trackEvent('message_send_failed');
      return null;
    }
```

- [ ] **Step 2: Update ChatNotifierWithOutbox similarly**

Apply the same pattern to `chat_provider_with_outbox.dart` - add `_analytics` parameter and tracking calls.

- [ ] **Step 3: Update providers.dart to pass analytics**

```dart
final chatStateProvider = StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
  return ChatNotifierWithOutbox(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(authStateProvider).user?.id ?? '',
    ref.watch(e2eeManagerProvider),
    ref.watch(e2eeMetaStoreProvider),
    ref.watch(messageOutboxProvider),
    ref.watch(networkStatusProvider.notifier),
    ref.watch(analyticsProvider),
  );
});
```

- [ ] **Step 4: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_provider.dart flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(web): add analytics tracking to chat message flow"
```

---

### Task 12: Event Tracking in WS + App Lifecycle

**Files:**
- Modify: `apps/web/lib/app.dart`
- Modify: `apps/web/lib/features/chat/presentation/chat_provider.dart` (WS events)

- [ ] **Step 1: Add app_start event in app.dart**

```dart
// apps/web/lib/app.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final analytics = ref.read(analyticsProvider);
      analytics.trackEvent('app_start', {'platform': 'web'});
      ref.read(authStateProvider.notifier).checkAuth();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'IM',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      routerConfig: router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
```

- [ ] **Step 2: Add WS connection events in ChatNotifier**

In `chat_provider.dart`, add tracking to WS connection state changes (around line 84-88):

```dart
    _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _analytics.trackEvent('ws_connected');
        _syncOfflineMessages();
      } else if (wsState == WsConnectionState.disconnected) {
        _analytics.trackEvent('ws_disconnected');
      }
    });
```

- [ ] **Step 3: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/app.dart flutter/apps/web/lib/features/chat/presentation/chat_provider.dart
git commit -m "feat(web): add analytics tracking to app lifecycle and WS events"
```

---

### Task 13: Adapter Barrel Export

**Files:**
- Create: `apps/web/lib/adapters/services/services.dart`

- [ ] **Step 1: Create barrel export**

```dart
// apps/web/lib/adapters/services/services.dart
export 'noop_analytics_adapter.dart';
export 'noop_error_reporter_adapter.dart';
export 'noop_file_preview_adapter.dart';
export 'noop_map_adapter.dart';
export 'noop_payment_adapter.dart';
export 'noop_push_adapter.dart';
```

- [ ] **Step 2: Update adapters.dart**

```dart
// apps/web/lib/adapters/adapters.dart
export 'web_http_adapter.dart';
export 'web_ws_adapter.dart';
export 'web_storage_adapter.dart';
export 'web_e2ee_adapter.dart';
export 'services/services.dart';
```

- [ ] **Step 3: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/adapters/services/services.dart apps/web/lib/adapters/adapters.dart
git commit -m "feat(web): add services adapter barrel export"
```

---

### Task 14: Event Tracking in File Upload

**Files:**
- Modify: `apps/web/lib/features/chat/data/file_api.dart`

- [ ] **Step 1: Add analytics to file upload**

In `file_api.dart`, add import and tracking:

```dart
import 'package:im_core/im_core.dart';
```

Modify the `FileApi` class to accept `AnalyticsPort` and track upload events:

```dart
class FileApi {
  FileApi(this._httpClient, this._analytics);

  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

  Future<String> uploadFile(FileUploadRequest request) async {
    _analytics.trackEvent('file_upload_start', {
      'type': request.mimeType,
    });
    try {
      // existing upload logic...
      final response = await _httpClient.post<...>(...);
      return response.data;
    } catch (e) {
      _analytics.trackEvent('file_upload_failed', {
        'error_type': 'upload_error',
      });
      rethrow;
    }
  }
}
```

- [ ] **Step 2: Update providers.dart**

```dart
final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider), ref.watch(analyticsProvider));
});
```

- [ ] **Step 3: Verify build passes**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/chat/data/file_api.dart flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(web): add analytics tracking to file upload flow"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run core tests**

Run: `cd packages/core && dart test`
Expected: All tests pass

- [ ] **Step 2: Run web analysis**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test and analysis issues"
```
