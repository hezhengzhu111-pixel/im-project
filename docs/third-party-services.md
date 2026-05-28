# Third-Party Service Integration Guide

## Architecture Overview

All third-party services follow the Ports & Adapters pattern:

```
packages/core/lib/src/services/    ← Abstract ports (platform-agnostic)
apps/web/lib/adapters/services/    ← Web adapters (Noop or real SDK)
apps/web/lib/core/di/              ← Riverpod DI wiring
```

## Configuration

Services are enabled/disabled via `--dart-define` at build time:

```bash
# Enable analytics
flutter run --dart-define=ANALYTICS_ENABLED=true

# Enable multiple services
flutter build web \
  --dart-define=ANALYTICS_ENABLED=true \
  --dart-define=ERROR_REPORTER_ENABLED=true \
  --dart-define=PUSH_ENABLED=true
```

Available flags:
- `ANALYTICS_ENABLED`
- `ERROR_REPORTER_ENABLED`
- `PUSH_ENABLED`
- `PAYMENT_ENABLED`
- `MAP_ENABLED`
- `FILE_PREVIEW_ENABLED`

## Adding a New SDK

### Step 1: Create the Adapter

Create a new file in `apps/web/lib/adapters/services/`:

```dart
// apps/web/lib/adapters/services/sentry_error_reporter_adapter.dart
import 'package:im_core/core.dart';

class SentryErrorReporterAdapter implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {
    // Send to Sentry
    Sentry.captureException(error, stackTrace: stackTrace, hint: extra);
  }

  @override
  void reportMessage(String message, {String? level}) {
    // Send to Sentry
    Sentry.captureMessage(message, level: level);
  }
}
```

### Step 2: Update the Provider

In `apps/web/lib/core/di/third_party_providers.dart`:

```dart
import '../adapters/services/sentry_error_reporter_adapter.dart';

final errorReporterProvider = Provider<ErrorReporterPort>((ref) {
  return ref.watch(appConfigProvider).errorReporterEnabled
      ? SentryErrorReporterAdapter()  // Real SDK
      : NoopErrorReporterAdapter();   // Noop fallback
});
```

### Step 3: Export the Adapter

Add to `apps/web/lib/adapters/services/services.dart`:

```dart
export 'sentry_error_reporter_adapter.dart';
```

## SDK Integration Examples

### Sentry (Error Reporting)

```dart
// adapters/services/sentry_error_reporter_adapter.dart
class SentryErrorReporterAdapter implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {
    Sentry.configureScope((scope) {
      extra?.forEach((key, value) => scope.setExtra(key, value));
    });
    Sentry.captureException(error, stackTrace: stackTrace);
  }

  @override
  void reportMessage(String message, {String? level}) {
    Sentry.captureMessage(message, level: _mapLevel(level));
  }

  SentryLevel _mapLevel(String? level) {
    switch (level) {
      case 'error': return SentryLevel.error;
      case 'warning': return SentryLevel.warning;
      case 'info': return SentryLevel.info;
      default: return SentryLevel.info;
    }
  }
}
```

### Firebase Analytics

```dart
// adapters/services/firebase_analytics_adapter.dart
class FirebaseAnalyticsAdapter implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    FirebaseAnalytics.instance.logEvent(
      name: eventName,
      parameters: properties,
    );
  }

  @override
  void setUserId(String? userId) {
    FirebaseAnalytics.instance.setUserId(id: userId);
  }

  @override
  void setUserProperties(Map<String, dynamic> properties) {
    properties.forEach((key, value) {
      FirebaseAnalytics.instance.setUserProperty(name: key, value: value.toString());
    });
  }
}
```

### Stripe (Payments)

```dart
// adapters/services/stripe_payment_adapter.dart
class StripePaymentAdapter implements PaymentPort {
  @override
  Future<PaymentResult> purchase(PaymentRequest request) async {
    try {
      final session = await Stripe.instance.confirmPayment(
        paymentIntentClientSecret: request.metadata?['clientSecret'],
      );
      return PaymentResult(
        success: true,
        transactionId: session.id,
      );
    } catch (e) {
      return PaymentResult(success: false, error: e.toString());
    }
  }

  @override
  Future<List<PurchaseHistory>> getPurchaseHistory() async {
    // Fetch from Stripe API
    return [];
  }
}
```

### Google Maps

```dart
// adapters/services/google_maps_adapter.dart
class GoogleMapsAdapter implements MapPort {
  @override
  Future<GeoResult> geocode(String address) async {
    // Use Google Maps Geocoding API
    final results = await _geocoding.findAddresses(address);
    if (results.isEmpty) return const GeoResult(address: '', latitude: 0, longitude: 0);
    return GeoResult(
      address: results.first.address,
      latitude: results.first.position.latitude,
      longitude: results.first.position.longitude,
    );
  }

  @override
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds) async {
    // Use Google Maps Places API
    return [];
  }
}
```

### Web Push (FCM)

```dart
// adapters/services/fcm_push_adapter.dart
class FcmPushAdapter implements PushPort {
  @override
  Future<String?> subscribe() async {
    final token = await FirebaseMessaging.instance.getToken();
    // Send token to backend for registration
    return token;
  }

  @override
  Future<void> unsubscribe() async {
    await FirebaseMessaging.instance.deleteToken();
  }

  @override
  Stream<PushMessage> get onMessage => FirebaseMessaging.onMessage.map((message) {
    return PushMessage(
      title: message.notification?.title ?? '',
      body: message.notification?.body ?? '',
      data: message.data,
    );
  });
}
```

## Privacy Guidelines

**Never include in event properties:**
- Message plaintext
- Auth tokens
- Phone numbers
- Email addresses
- User names (use IDs instead)
- Any PII

**Safe metadata to include:**
- `type` (message type, file type)
- `encrypted` (boolean)
- `platform` (web, mobile)
- `error_type` (auth, upload, network)
- `method` (password, oauth)

## Testing

### Unit Tests

Noop implementations are safe for unit tests:

```dart
test('analytics tracks events', () {
  final mock = MockAnalyticsAdapter();
  final auth = AuthNotifier(repo, ws, http, mock);

  await auth.login('user', 'pass');

  verify(mock.trackEvent('login_success', {'method': 'password'}));
});
```

### Integration Tests

Use `RecordingAdapter` to verify event sequences:

```dart
class RecordingAnalyticsAdapter implements AnalyticsPort {
  final List<AnalyticsEvent> events = [];

  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    events.add(AnalyticsEvent(name: eventName, properties: properties));
  }
  // ...
}
```
