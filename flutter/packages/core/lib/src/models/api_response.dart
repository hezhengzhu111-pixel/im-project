import 'package:freezed_annotation/freezed_annotation.dart';

part 'api_response.freezed.dart';
part 'api_response.g.dart';

@Freezed(genericArgumentFactories: true)
class ApiResponse<T> with _$ApiResponse<T> {
  const factory ApiResponse({
    required int code,
    required String message,
    required T data,
    int? timestamp,
    bool? success,
  }) = _ApiResponse<T>;

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) =>
      _$ApiResponseFromJson(json, fromJsonT);
}

@freezed
class PageRequest with _$PageRequest {
  const factory PageRequest({
    required int page,
    required int size,
    String? sort,
    String? order,
  }) = _PageRequest;

  factory PageRequest.fromJson(Map<String, dynamic> json) =>
      _$PageRequestFromJson(json);
}

@Freezed(genericArgumentFactories: true)
class PageResponse<T> with _$PageResponse<T> {
  const factory PageResponse({
    required List<T> content,
    required int totalElements,
    required int totalPages,
    required int page,
    required int size,
    required bool first,
    required bool last,
  }) = _PageResponse<T>;

  factory PageResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) =>
      _$PageResponseFromJson(json, fromJsonT);
}

@freezed
class FileUploadResponse with _$FileUploadResponse {
  const factory FileUploadResponse({
    required String url,
    String? thumbnailUrl,
    int? size,
    String? originalFilename,
    String? filename,
    String? contentType,
    String? category,
    String? uploadDate,
    int? uploadTime,
    String? uploaderId,
    String? fileName,
    String? fileType,
  }) = _FileUploadResponse;

  factory FileUploadResponse.fromJson(Map<String, dynamic> json) =>
      _$FileUploadResponseFromJson(json);
}
