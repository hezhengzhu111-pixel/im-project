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
  FileApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<UploadResult> uploadImage(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadImage,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadFile(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadFile,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadAudio(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadAudio,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadVideo(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadVideo,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }
}
