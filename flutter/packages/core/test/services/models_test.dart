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
