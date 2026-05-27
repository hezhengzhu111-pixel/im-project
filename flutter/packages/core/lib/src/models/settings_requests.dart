import 'package:freezed_annotation/freezed_annotation.dart';

part 'settings_requests.freezed.dart';
part 'settings_requests.g.dart';

@freezed
class ChangePasswordRequest with _$ChangePasswordRequest {
  const factory ChangePasswordRequest({
    required String currentPassword,
    required String newPassword,
  }) = _ChangePasswordRequest;

  factory ChangePasswordRequest.fromJson(Map<String, dynamic> json) =>
      _$ChangePasswordRequestFromJson(json);
}

@freezed
class BindPhoneRequest with _$BindPhoneRequest {
  const factory BindPhoneRequest({
    required String phone,
    required String code,
  }) = _BindPhoneRequest;

  factory BindPhoneRequest.fromJson(Map<String, dynamic> json) =>
      _$BindPhoneRequestFromJson(json);
}

@freezed
class BindEmailRequest with _$BindEmailRequest {
  const factory BindEmailRequest({
    required String email,
    required String code,
  }) = _BindEmailRequest;

  factory BindEmailRequest.fromJson(Map<String, dynamic> json) =>
      _$BindEmailRequestFromJson(json);
}

@freezed
class UpdateProfileRequest with _$UpdateProfileRequest {
  const factory UpdateProfileRequest({
    String? nickname,
    String? email,
    String? phone,
    String? gender,
    String? birthday,
    String? signature,
    String? location,
    String? avatar,
  }) = _UpdateProfileRequest;

  factory UpdateProfileRequest.fromJson(Map<String, dynamic> json) =>
      _$UpdateProfileRequestFromJson(json);
}
