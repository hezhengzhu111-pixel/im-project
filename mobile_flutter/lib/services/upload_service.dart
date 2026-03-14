import 'dart:io';

import 'package:dio/dio.dart';

import 'http_client.dart';

class UploadResult {
  UploadResult({
    required this.url,
    required this.fileName,
    required this.size,
  });

  final String url;
  final String fileName;
  final int size;
}

class UploadService {
  UploadService(this.httpClient);

  final HttpClient httpClient;
  CancelToken? _activeCancelToken;

  void cancelActiveUpload() {
    _activeCancelToken?.cancel('用户取消上传');
    _activeCancelToken = null;
  }

  Future<UploadResult> uploadImage(
    String path, {
    void Function(double progress)? onProgress,
  }) async {
    return _upload(
      path: path,
      endpoint: '/file/upload/image',
      onProgress: onProgress,
    );
  }

  Future<UploadResult> uploadFile(
    String path, {
    void Function(double progress)? onProgress,
  }) async {
    return _upload(
      path: path,
      endpoint: '/file/upload/file',
      onProgress: onProgress,
    );
  }

  Future<UploadResult> _upload({
    required String path,
    required String endpoint,
    void Function(double progress)? onProgress,
  }) async {
    _activeCancelToken?.cancel('新上传开始');
    _activeCancelToken = CancelToken();
    final file = File(path);
    final fileName = file.path.split(RegExp(r'[\\/]')).last;
    final size = await file.length();
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: fileName),
    });
    final response = await httpClient.dio.post(
      endpoint,
      data: formData,
      options: Options(
        contentType: 'multipart/form-data',
      ),
      cancelToken: _activeCancelToken,
      onSendProgress: (sent, total) {
        if (onProgress == null || total <= 0) return;
        onProgress((sent / total).clamp(0, 1));
      },
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final url = data['url']?.toString() ?? '';
    if (url.isEmpty) {
      throw Exception('上传失败：未返回文件地址');
    }
    return UploadResult(
      url: url,
      fileName: data['filename']?.toString() ?? fileName,
      size: int.tryParse('${data['size'] ?? size}') ?? size,
    );
  }
}
