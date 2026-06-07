import 'dart:typed_data';
import 'package:im_core/core.dart';

class UploadResult {
  const UploadResult({
    required this.url,
    required this.name,
    required this.size,
    this.thumbnailUrl,
  });

  final String url;
  final String name;
  final int size;
  final String? thumbnailUrl;

  factory UploadResult.fromJson(Map<String, dynamic> json) {
    return UploadResult(
      url: json['url'] as String? ?? json['data'] as String? ?? '',
      name: json['name'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }
}

class FileApi {
  FileApi(this._httpClient, this._analytics);
  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

  Future<UploadResult> uploadImage(Uint8List bytes, String fileName) async {
    _analytics.trackEvent('file_upload_start', {'type': 'image'});
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        FileEndpoints.uploadImage,
        body: {'file': bytes, 'fileName': fileName},
        fromJson: (json) => json,
      );
      return UploadResult.fromJson(response.data);
    } catch (e) {
      _analytics
          .trackEvent('file_upload_failed', {'error_type': 'upload_error'});
      rethrow;
    }
  }

  Future<UploadResult> uploadFile(Uint8List bytes, String fileName) async {
    _analytics.trackEvent('file_upload_start', {'type': 'file'});
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        FileEndpoints.uploadFile,
        body: {'file': bytes, 'fileName': fileName},
        fromJson: (json) => json,
      );
      return UploadResult.fromJson(response.data);
    } catch (e) {
      _analytics
          .trackEvent('file_upload_failed', {'error_type': 'upload_error'});
      rethrow;
    }
  }

  Future<UploadResult> uploadAudio(Uint8List bytes, String fileName) async {
    _analytics.trackEvent('file_upload_start', {'type': 'audio'});
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        FileEndpoints.uploadAudio,
        body: {'file': bytes, 'fileName': fileName},
        fromJson: (json) => json,
      );
      return UploadResult.fromJson(response.data);
    } catch (e) {
      _analytics
          .trackEvent('file_upload_failed', {'error_type': 'upload_error'});
      rethrow;
    }
  }

  Future<UploadResult> uploadVideo(Uint8List bytes, String fileName) async {
    _analytics.trackEvent('file_upload_start', {'type': 'video'});
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        FileEndpoints.uploadVideo,
        body: {'file': bytes, 'fileName': fileName},
        fromJson: (json) => json,
      );
      return UploadResult.fromJson(response.data);
    } catch (e) {
      _analytics
          .trackEvent('file_upload_failed', {'error_type': 'upload_error'});
      rethrow;
    }
  }
}
