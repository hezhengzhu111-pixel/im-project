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

class FileInfoDto {
  const FileInfoDto({
    required this.id,
    required this.name,
    required this.size,
    this.url,
    this.mimeType,
    this.uploadTime,
  });

  final String id;
  final String name;
  final int size;
  final String? url;
  final String? mimeType;
  final String? uploadTime;

  factory FileInfoDto.fromJson(Map<String, dynamic> json) {
    return FileInfoDto(
      id: json['id']?.toString() ?? '',
      name: json['name'] as String? ?? json['fileName'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      url: json['url'] as String?,
      mimeType: json['mimeType'] as String? ?? json['contentType'] as String?,
      uploadTime:
          json['uploadTime'] as String? ?? json['createdAt'] as String?,
    );
  }
}

class FileDeleteRequest {
  const FileDeleteRequest({required this.fileId, this.url});

  final String fileId;
  final String? url;

  Map<String, dynamic> toJson() => {
        'fileId': fileId,
        if (url != null) 'url': url,
      };
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

  Future<UploadResult> uploadAvatar(Uint8List bytes, String fileName) async {
    _analytics.trackEvent('file_upload_start', {'type': 'avatar'});
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        FileEndpoints.uploadAvatar,
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

  Future<Map<String, dynamic>> downloadByGet({
    required String fileId,
    String? token,
  }) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      FileEndpoints.download,
      queryParameters: {
        'fileId': fileId,
        if (token != null) 'token': token,
      },
      fromJson: (json) => json,
    );
    return response.data;
  }

  Future<Map<String, dynamic>> downloadByPost({
    required String fileId,
    String? token,
  }) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.download,
      body: {
        'fileId': fileId,
        if (token != null) 'token': token,
      },
      fromJson: (json) => json,
    );
    return response.data;
  }

  Future<FileInfoDto> getFileInfo(String fileId) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.info,
      body: {'fileId': fileId},
      fromJson: (json) => json,
    );
    return FileInfoDto.fromJson(response.data);
  }

  Future<void> deleteFile(FileDeleteRequest request) async {
    await _httpClient.delete<void>(
      FileEndpoints.delete,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }
}
