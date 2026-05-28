import 'package:freezed_annotation/freezed_annotation.dart';

part 'models.freezed.dart';
part 'models.g.dart';

class AnalyticsEvent {
  AnalyticsEvent({
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
