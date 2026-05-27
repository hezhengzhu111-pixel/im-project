import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../data/moments_repository.dart';
import 'widgets/visibility_picker.dart';

class ComposerFile {
  const ComposerFile({
    required this.bytes,
    required this.fileName,
    required this.isVideo,
  });

  final Uint8List bytes;
  final String fileName;
  final bool isVideo;
}

class ComposerState {
  const ComposerState({
    this.content = '',
    this.visibility = MomentVisibility.public,
    this.location = '',
    this.files = const [],
    this.isPublishing = false,
    this.error,
  });

  final String content;
  final MomentVisibility visibility;
  final String location;
  final List<ComposerFile> files;
  final bool isPublishing;
  final String? error;

  bool get canPublish => content.trim().isNotEmpty || files.isNotEmpty;

  ComposerState copyWith({
    String? content,
    MomentVisibility? visibility,
    String? location,
    List<ComposerFile>? files,
    bool? isPublishing,
    String? error,
  }) {
    return ComposerState(
      content: content ?? this.content,
      visibility: visibility ?? this.visibility,
      location: location ?? this.location,
      files: files ?? this.files,
      isPublishing: isPublishing ?? this.isPublishing,
      error: error,
    );
  }
}

class ComposerNotifier extends StateNotifier<ComposerState> {
  ComposerNotifier(this._repository) : super(const ComposerState());

  final MomentsRepository _repository;

  void setContent(String value) => state = state.copyWith(content: value);
  void setVisibility(MomentVisibility value) => state = state.copyWith(visibility: value);
  void setLocation(String value) => state = state.copyWith(location: value);

  void addFile(ComposerFile file) {
    if (state.files.length >= 9) return;
    state = state.copyWith(files: [...state.files, file]);
  }

  void removeFile(int index) {
    final newFiles = [...state.files]..removeAt(index);
    state = state.copyWith(files: newFiles);
  }

  Future<bool> publish() async {
    if (!state.canPublish) return false;

    state = state.copyWith(isPublishing: true, error: null);
    try {
      final fileBytes = state.files.map((f) => f.bytes).toList();
      final fileNames = state.files.map((f) => f.fileName).toList();
      final isVideoList = state.files.map((f) => f.isVideo).toList();

      await _repository.createPost(
        content: state.content.trim().isEmpty ? null : state.content.trim(),
        visibility: state.visibility.value,
        location: state.location.trim().isEmpty ? null : state.location.trim(),
        fileBytes: fileBytes.isNotEmpty ? fileBytes : null,
        fileNames: fileNames.isNotEmpty ? fileNames : null,
        isVideoList: isVideoList.isNotEmpty ? isVideoList : null,
      );

      // Reset state
      state = const ComposerState();
      return true;
    } catch (e) {
      state = state.copyWith(isPublishing: false, error: e.toString());
      return false;
    }
  }
}

final composerProvider = StateNotifierProvider<ComposerNotifier, ComposerState>((ref) {
  return ComposerNotifier(ref.watch(momentsRepositoryProvider));
});
