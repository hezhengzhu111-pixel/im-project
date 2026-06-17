import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import '../../auth/presentation/auth_providers.dart';
import '../presentation/settings_providers.dart';

class ProfileSettingsPage extends ConsumerStatefulWidget {
  const ProfileSettingsPage({super.key});

  @override
  ConsumerState<ProfileSettingsPage> createState() =>
      _ProfileSettingsPageState();
}

class _ProfileSettingsPageState extends ConsumerState<ProfileSettingsPage> {
  final _formKey = GlobalKey<FormState>();
  final _nicknameController = TextEditingController();
  final _signatureController = TextEditingController();
  final _locationController = TextEditingController();
  bool _initialized = false;

  @override
  void dispose() {
    _nicknameController.dispose();
    _signatureController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _initControllers(User user) {
    if (_initialized) return;
    _nicknameController.text = user.nickname ?? '';
    _signatureController.text = user.signature ?? '';
    _locationController.text = user.location ?? '';
    _initialized = true;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    try {
      await ref.read(profileStateProvider.notifier).updateProfile(
            UpdateProfileRequest(
              nickname: _nicknameController.text.trim(),
              signature: _signatureController.text.trim(),
              location: _locationController.text.trim(),
            ),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.saveSuccess)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.saveFailed)),
        );
      }
    }
  }

  Future<void> _uploadAvatar() async {
    final user = ref.read(authStateProvider).user;
    if (user == null) return;

    try {
      final picker = ref.read(filePickerPortProvider);
      final result = await picker.pickImage(source: ImageSource.gallery);

      if (!mounted) return;

      switch (result) {
        case Success(:final data):
          try {
            final updatedUser = await ref
                .read(profileStateProvider.notifier)
                .uploadAvatar(data.bytes, data.name, currentUser: user);
            ref.read(authStateProvider.notifier).updateUser(updatedUser);
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text(_Strings.avatarUploadSuccess)),
              );
            }
          } catch (_) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text(_Strings.avatarUploadFailed)),
              );
            }
          }
        case Failure():
          // User cancelled or picker failed — do nothing
          break;
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.avatarUploadFailed)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final profileState = ref.watch(profileStateProvider);
    final user = authState.user;
    final theme = Theme.of(context);

    if (user == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    _initControllers(user);

    return Scaffold(
      appBar: AppBar(
        title: const Text(_Strings.title),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar section
          Center(
            child: GestureDetector(
              onTap: _uploadAvatar,
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 48,
                    backgroundImage: user.avatar != null
                        ? NetworkImage(user.avatar!)
                        : null,
                    child: user.avatar == null
                        ? Text(
                            (user.nickname ?? user.username)
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(fontSize: 32),
                          )
                        : null,
                  ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.camera_alt,
                        size: 16,
                        color: theme.colorScheme.onPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              _Strings.avatarHint,
              style: theme.textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 24),

          // Username (read-only)
          TextFormField(
            initialValue: user.username,
            decoration: const InputDecoration(
              labelText: _Strings.username,
              border: OutlineInputBorder(),
            ),
            enabled: false,
          ),
          const SizedBox(height: 16),

          // Profile form
          Form(
            key: _formKey,
            child: Column(
              children: [
                TextFormField(
                  controller: _nicknameController,
                  decoration: const InputDecoration(
                    labelText: _Strings.nickname,
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value != null &&
                        value.trim().isNotEmpty &&
                        value.trim().length > 20) {
                      return _Strings.nicknameTooLong;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  initialValue: user.email ?? '',
                  decoration: const InputDecoration(
                    labelText: _Strings.email,
                    border: OutlineInputBorder(),
                  ),
                  enabled: false,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  initialValue: user.phone ?? '',
                  decoration: const InputDecoration(
                    labelText: _Strings.phone,
                    border: OutlineInputBorder(),
                  ),
                  enabled: false,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _signatureController,
                  decoration: const InputDecoration(
                    labelText: _Strings.signature,
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _locationController,
                  decoration: const InputDecoration(
                    labelText: _Strings.location,
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          if (profileState.saving)
            const Center(child: CircularProgressIndicator())
          else
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _save,
                child: const Text(_Strings.saveButton),
              ),
            ),
        ],
      ),
    );
  }
}

class _Strings {
  _Strings._();
  static const title = 'Profile Settings';
  static const avatarHint = 'Tap to change avatar';
  static const avatarUploadSuccess = 'Avatar updated successfully';
  static const avatarUploadFailed = 'Failed to upload avatar';
  static const username = 'Username';
  static const nickname = 'Nickname';
  static const nicknameTooLong = 'Nickname must be 20 characters or less';
  static const email = 'Email';
  static const phone = 'Phone';
  static const signature = 'Signature';
  static const location = 'Location';
  static const saveButton = 'Save';
  static const saveSuccess = 'Profile updated successfully';
  static const saveFailed = 'Failed to update profile';
}
