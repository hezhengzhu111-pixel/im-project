import 'package:test/test.dart';
import 'package:im_core/src/services/analytics_port.dart';
import 'package:im_core/src/logging/sanitized_error.dart';
import 'package:im_core/src/services/error_reporter_port.dart';
import 'package:im_core/src/services/payment_port.dart';
import 'package:im_core/src/services/map_port.dart';
import 'package:im_core/src/services/push_port.dart';
import 'package:im_core/src/services/file_preview_port.dart';
import 'package:im_core/src/services/models.dart';

void main() {
  group('NoopAnalyticsPort', () {
    test('trackEvent does not throw', () {
      final noop = NoopAnalyticsPort();
      expect(() => noop.trackEvent('test', {'key': 'value'}), returnsNormally);
    });

    test('setUserId does not throw', () {
      final noop = NoopAnalyticsPort();
      expect(() => noop.setUserId('user_123'), returnsNormally);
      expect(() => noop.setUserId(null), returnsNormally);
    });

    test('setUserProperties does not throw', () {
      final noop = NoopAnalyticsPort();
      expect(() => noop.setUserProperties({'plan': 'premium'}), returnsNormally);
    });
  });

  group('NoopErrorReporterPort', () {
    test('reportError does not throw', () {
      final noop = NoopErrorReporterPort();
      expect(
        () => noop.reportError(SanitizedError(
          errorType: 'Exception',
          category: 'unknown_error',
          safeMessage: 'test',
        )),
        returnsNormally,
      );
    });

    test('reportMessage does not throw', () {
      final noop = NoopErrorReporterPort();
      expect(() => noop.reportMessage('test message', level: 'info'), returnsNormally);
    });
  });

  group('NoopPaymentPort', () {
    test('purchase returns failure', () async {
      final noop = NoopPaymentPort();
      final result = await noop.purchase(
        const PaymentRequest(productId: 'test', price: 9.99, currency: 'USD'),
      );
      expect(result.success, false);
      expect(result.error, 'Payment not available in this environment');
    });

    test('getPurchaseHistory returns empty list', () async {
      final noop = NoopPaymentPort();
      final history = await noop.getPurchaseHistory();
      expect(history, isEmpty);
    });
  });

  group('NoopMapPort', () {
    test('geocode returns zero coordinates', () async {
      final noop = NoopMapPort();
      final result = await noop.geocode('123 Main St');
      expect(result.address, '');
      expect(result.latitude, 0);
      expect(result.longitude, 0);
    });

    test('searchPlaces returns empty list', () async {
      final noop = NoopMapPort();
      final results = await noop.searchPlaces('coffee shop', null);
      expect(results, isEmpty);
    });
  });

  group('NoopPushPort', () {
    test('subscribe returns null', () async {
      final noop = NoopPushPort();
      final token = await noop.subscribe();
      expect(token, isNull);
    });

    test('unsubscribe does not throw', () async {
      final noop = NoopPushPort();
      expect(() => noop.unsubscribe(), returnsNormally);
    });

    test('onMessage returns empty stream', () {
      final noop = NoopPushPort();
      expect(noop.onMessage, emitsDone);
    });
  });

  group('NoopFilePreviewPort', () {
    test('canPreview returns false for all MIME types', () {
      final noop = NoopFilePreviewPort();
      expect(noop.canPreview('application/pdf'), false);
      expect(noop.canPreview('image/png'), false);
      expect(noop.canPreview('video/mp4'), false);
      expect(noop.canPreview('text/plain'), false);
    });

    test('openPreview does not throw', () {
      final noop = NoopFilePreviewPort();
      expect(
        () => noop.openPreview(const FilePreviewRequest(
          url: 'https://example.com/file.pdf',
          mimeType: 'application/pdf',
          fileName: 'test.pdf',
        )),
        returnsNormally,
      );
    });
  });

  group('AnalyticsEvent', () {
    test('creates with default timestamp', () {
      final event = AnalyticsEvent(name: 'test');
      expect(event.name, 'test');
      expect(event.timestamp, isA<DateTime>());
      expect(event.properties, isNull);
    });

    test('creates with custom properties', () {
      final event = AnalyticsEvent(
        name: 'login',
        properties: {'method': 'password'},
      );
      expect(event.properties, {'method': 'password'});
    });
  });
}
