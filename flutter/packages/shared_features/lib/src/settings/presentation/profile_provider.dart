import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/settings_api.dart';

class ProfileState {
  const ProfileState({
    this.loading = false,
    this.saving = false,
    this.user,
  });

  final bool loading;
  final bool saving;
  final User? user;

  ProfileState copyWith({
    bool? loading,
    bool? saving,
    User? user,
  }) {
    return ProfileState(
      loading: loading ?? this.loading,
      saving: saving ?? this.saving,
      user: user ?? this.user,
    );
  }
}

class ProfileNotifier extends StateNotifier<ProfileState> {
  ProfileNotifier(this._api) : super(const ProfileState());

  final SettingsApi _api;

  Future<void> loadProfile(User currentUser) async {
    state = state.copyWith(loading: true, user: currentUser);
    state = state.copyWith(loading: false);
  }

  Future<User> updateProfile(UpdateProfileRequest request) async {
    state = state.copyWith(saving: true);
    try {
      final updatedUser = await _api.updateProfile(request);
      state = state.copyWith(saving: false, user: updatedUser);
      return updatedUser;
    } catch (e) {
      state = state.copyWith(saving: false);
      rethrow;
    }
  }

  Future<User> uploadAvatar(
    Uint8List bytes,
    String fileName, {
    required User currentUser,
  }) async {
    state = state.copyWith(saving: true);
    try {
      final avatarUrl = await _api.uploadAvatar(bytes, fileName);
      final baseUser = state.user ?? currentUser;
      final updatedUser = baseUser.copyWith(avatar: avatarUrl);
      state = state.copyWith(saving: false, user: updatedUser);
      return updatedUser;
    } catch (e) {
      state = state.copyWith(saving: false);
      rethrow;
    }
  }

  Future<void> changePassword(ChangePasswordRequest request) async {
    await _api.changePassword(request);
  }

  Future<void> sendPhoneCode(String phone) async {
    await _api.sendPhoneCode(phone);
  }

  Future<void> bindPhone(BindPhoneRequest request) async {
    await _api.bindPhone(request);
    final currentUser = state.user;
    if (currentUser != null) {
      state = state.copyWith(
        user: currentUser.copyWith(phone: request.phone),
      );
    }
  }

  Future<void> sendEmailCode(String email) async {
    await _api.sendEmailCode(email);
  }

  Future<void> bindEmail(BindEmailRequest request) async {
    await _api.bindEmail(request);
    final currentUser = state.user;
    if (currentUser != null) {
      state = state.copyWith(
        user: currentUser.copyWith(email: request.email),
      );
    }
  }
}
