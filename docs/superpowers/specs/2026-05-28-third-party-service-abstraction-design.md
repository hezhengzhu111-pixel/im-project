# Third-Party Service Abstraction Layer

## Overview

Establish a unified abstraction layer for third-party capabilities (analytics, crash reporting, payments, maps, push notifications, file preview) following the existing Ports & Adapters architecture. Prevents SDK scatter across features and enables desktop reuse.

## Architecture

### Core Ports (`packages/core/lib/src/services/`)

Each service is an abstract port with a Noop implementation in core:

```dart
// analytics_port.dart
abstract class AnalyticsPort {
  void trackEvent(String eventName, [Map<String, dynamic>? properties]);
  void setUserId(String? userId);
  void setUserProperties(Map<String, dynamic> properties);
}

// error_reporter_port.dart
abstract class ErrorReporterPort {
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra});
  void reportMessage(String message, {String? level});
}

// payment_port.dart
abstract class PaymentPort {
  Future<PaymentResult> purchase(PaymentRequest request);
  Future<List<PurchaseHistory>> getPurchaseHistory();
}

// map_port.dart
abstract class MapPort {
  Widget buildMap(MapConfig config);
  Future<GeoResult> geocode(String address);
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds);
}

// push_port.dart
abstract class PushPort {
  Future<String?> subscribe();
  Future<void> unsubscribe();
  Stream<PushMessage> get onMessage;
}

// file_preview_port.dart
abstract class FilePreviewPort {
  bool canPreview(String mimeType);
  void openPreview(FilePreviewRequest request);
}
```

### Event Model

```dart
class AnalyticsEvent {
  final String name;
  final DateTime timestamp;
  final Map<String, dynamic>? properties;
}
```

Events use `事件名 + 时间戳 + 可选Map` format for flexibility. Noop implementations ignore all parameters.

### AppConfig (Compile-time)

```dart
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

Configuration via `--dart-define=ANALYTICS_ENABLED=true` at build time.

### Web Adapters (`apps/web/lib/adapters/services/`)

Noop implementations for each port:
- `noop_analytics_adapter.dart`
- `noop_error_reporter_adapter.dart`
- `noop_push_adapter.dart`
- `noop_payment_adapter.dart`
- `noop_map_adapter.dart`
- `noop_file_preview_adapter.dart`

### DI Wiring (`apps/web/lib/core/di/providers.dart`)

```dart
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

final analyticsProvider = Provider<AnalyticsPort>((ref) {
  return ref.watch(appConfigProvider).analyticsEnabled
      ? WebAnalyticsAdapter()
      : NoopAnalyticsAdapter();
});
// Same pattern for all other services
```

## Event Tracking Integration Points

### Auth (`auth_provider.dart`)
- `login()` success: `trackEvent('login_success', {'method': 'password'})`
- `login()` failure: `trackEvent('login_failed', {'error_type': 'auth'})`
- `register()` success/failure

### Chat (`chat_provider.dart`)
- `sendMessage()` success: `trackEvent('message_send', {'type': messageType, 'encrypted': e2eeStatus})`
- `sendMessage()` failure: `trackEvent('message_send_failed')`

### WebSocket
- Connected: `trackEvent('ws_connected')`
- Disconnected: `trackEvent('ws_disconnected', {'reason': ...})`

### App Lifecycle (`app.dart`)
- Startup: `trackEvent('app_start', {'platform': 'web'})`

### File Upload
- Start: `trackEvent('file_upload_start', {'type': mimeType})`
- Failure: `trackEvent('file_upload_failed', {'error_type': ...})`

## Privacy Constraints

Events must NEVER include:
- Message plaintext
- Auth tokens
- Phone numbers
- Email addresses
- Any PII

Allowed metadata: `mimeType`, `messageType`, `encrypted`, `platform`, `error_type`, `method`.

## Testing Strategy

- Noop implementations for unit tests (zero side effects)
- `MockAnalyticsAdapter` in `test/` for verifying event calls
- `RecordingAdapter` for integration tests to assert event names and parameters

## SDK Integration Guide

Each SDK integration requires:
1. Create adapter implementing the Port (e.g., `SentryErrorReporterAdapter`)
2. Add config flag to `AppConfig`
3. Wire in `providers.dart` with environment check

Supported SDKs (documentation only, not implemented in this task):
- **Sentry** → `ErrorReporterPort`
- **Firebase Analytics** → `AnalyticsPort`
- **Stripe** → `PaymentPort`
- **Google Maps** → `MapPort`
- **Web Push (FCM)** → `PushPort`
