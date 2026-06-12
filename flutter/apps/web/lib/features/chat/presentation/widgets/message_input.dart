import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';
import '../../data/file_api.dart';
import '../../data/file_providers.dart';
import '../../../../core/di/platform_providers.dart';
import 'network_status_banner.dart';

class MessageInput extends ConsumerStatefulWidget {
  const MessageInput({
    super.key,
    required this.onSend,
    required this.onSendImage,
    required this.onSendFile,
    required this.onSendVoice,
    this.focusNode,
    this.onFocusChanged,
    this.members,
  });

  final void Function(String text, List<String> mentionedUserIds) onSend;
  final void Function(UploadResult result) onSendImage;
  final void Function(UploadResult result) onSendFile;
  final void Function(UploadResult result) onSendVoice;
  final FocusNode? focusNode;
  final ValueChanged<bool>? onFocusChanged;
  final List<GroupMember>? members;

  @override
  ConsumerState<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends ConsumerState<MessageInput> {
  final _controller = TextEditingController();
  bool _isUploading = false;
  bool _isRecording = false;

  // @ mention state
  bool _showMention = false;
  int _mentionIndex = 0;
  int _mentionStart = 0;
  String _mentionFilter = '';
  final List<String> _mentionedIds = [];

  List<GroupMember> get _filteredMembers {
    final members = widget.members;
    if (members == null) return const [];
    if (_mentionFilter.isEmpty) return members.take(8).toList();
    final q = _mentionFilter.toLowerCase();
    return members
        .where((m) =>
            (m.nickname?.toLowerCase().contains(q) ?? false) ||
            m.userId.toLowerCase().contains(q))
        .take(8)
        .toList();
  }

  @override
  void initState() {
    super.initState();
    widget.focusNode?.addListener(_onFocusChange);
    _controller.addListener(_onTextChanged);
  }

  void _onFocusChange() {
    widget.onFocusChanged?.call(widget.focusNode!.hasFocus);
  }

  void _onTextChanged() {
    if (widget.members == null || widget.members!.isEmpty) return;

    final text = _controller.text;
    final selection = _controller.selection;
    if (!selection.isValid) return;

    final cursorPos = selection.baseOffset;
    final before = text.substring(0, cursorPos);

    final atIdx = before.lastIndexOf('@');
    if (atIdx == -1 ||
        (atIdx > 0 && before[atIdx - 1] != ' ' && before[atIdx - 1] != '\n')) {
      _resetMention();
      return;
    }

    final afterAt = before.substring(atIdx + 1);
    if (afterAt.contains(' ')) {
      _resetMention();
      return;
    }

    setState(() {
      _showMention = true;
      _mentionStart = cursorPos;
      _mentionFilter = afterAt;
      if (!_showMention) _mentionIndex = 0;
    });
  }

  void _resetMention() {
    if (_showMention) {
      setState(() {
        _showMention = false;
        _mentionIndex = 0;
        _mentionStart = 0;
        _mentionFilter = '';
      });
    }
  }

  void _selectMember(GroupMember member) {
    final text = _controller.text;
    final before = text.substring(0, _mentionStart);
    final atPos = before.lastIndexOf('@');
    final preAt = before.substring(0, atPos);
    final after = text.substring(_mentionStart);
    final name = member.nickname ?? member.userId;
    final newText = '$preAt@$name $after';
    _controller.text = newText;
    final newCursorPos = preAt.length + name.length + 2;
    _controller.selection = TextSelection.fromPosition(
      TextPosition(offset: newCursorPos),
    );
    if (!_mentionedIds.contains(member.userId)) {
      _mentionedIds.add(member.userId);
    }
    _resetMention();
    widget.focusNode?.requestFocus();
  }

  @override
  void didUpdateWidget(MessageInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode?.removeListener(_onFocusChange);
      widget.focusNode?.addListener(_onFocusChange);
    }
  }

  @override
  void dispose() {
    widget.focusNode?.removeListener(_onFocusChange);
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickAndSendImage() async {
    final filePicker = ref.read(filePickerPortProvider);
    final result = await filePicker.pickImage();

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendImage);
    }
  }

  Future<void> _pickAndSendFile() async {
    final filePicker = ref.read(filePickerPortProvider);
    final result = await filePicker.pickFile();

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendFile);
    }
  }

  Future<void> _recordAndSendVoice() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);
    final result = await audioRecorder.startRecording();

    if (result case Failure(:final error)) {
      if (mounted) {
        final loc = AppLocalizations.of(context)!;
        final msg = _mapError(error, loc);
        if (msg.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      }
      return;
    }
    setState(() => _isRecording = true);
  }

  Future<void> _stopRecordingAndSend() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);
    final result = await audioRecorder.stopRecording();

    setState(() => _isRecording = false);

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendVoice);
    } else if (result case Failure(:final error)) {
      if (mounted) {
        final loc = AppLocalizations.of(context)!;
        final msg = _mapError(error, loc);
        if (msg.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      }
    }
  }

  Future<void> _uploadAndSend(
    PickedFile file,
    void Function(UploadResult) callback,
  ) async {
    setState(() => _isUploading = true);

    try {
      final fileApi = ref.read(fileApiProvider);
      final uploadResult = await _uploadFile(fileApi, file);
      callback(uploadResult);
    } finally {
      setState(() => _isUploading = false);
    }
  }

  Future<UploadResult> _uploadFile(FileApi fileApi, PickedFile file) async {
    if (file.mimeType.startsWith('image/')) {
      return fileApi.uploadImage(file.bytes, file.name);
    } else if (file.mimeType.startsWith('audio/')) {
      return fileApi.uploadAudio(file.bytes, file.name);
    } else {
      return fileApi.uploadFile(file.bytes, file.name);
    }
  }

  void _showAttachmentMenu() {
    final loc = AppLocalizations.of(context)!;

    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.image),
              title: Text(loc.chatImage),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendImage();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: Text(loc.chatFile),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendFile();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_showMention) _buildMentionDropdown(),
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(top: BorderSide(color: theme.dividerColor)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: SafeArea(
            top: false,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 6),
                  child: OutboxIndicator(),
                ),
                Semantics(
                  label: loc.a11yAddAttachment,
                  button: true,
                  child: IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: _isUploading ? null : _showAttachmentMenu,
                    tooltip: loc.a11yAddAttachment,
                  ),
                ),
                Semantics(
                  label: loc.a11yVoiceInput,
                  button: true,
                  child: IconButton(
                    icon: Icon(_isRecording ? Icons.stop : Icons.mic),
                    onPressed: _isUploading
                        ? null
                        : () {
                            if (_isRecording) {
                              _stopRecordingAndSend();
                            } else {
                              _recordAndSendVoice();
                            }
                          },
                    tooltip: loc.a11yVoiceInput,
                    color: _isRecording ? Colors.red : null,
                  ),
                ),
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 42),
                    child: TextField(
                      controller: _controller,
                      focusNode: widget.focusNode,
                      decoration: InputDecoration(
                        hintText: loc.chatInputHint,
                        filled: true,
                        fillColor: theme.colorScheme.surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(4),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      minLines: 1,
                      maxLines: 4,
                      onSubmitted: (_) => _handleSend(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Semantics(
                  label: loc.a11ySendMessage,
                  button: true,
                  child: FilledButton(
                    onPressed: _isUploading ? null : _handleSend,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(46, 42),
                      padding: EdgeInsets.zero,
                    ),
                    child: const Icon(Icons.send, size: 20),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMentionDropdown() {
    final filtered = _filteredMembers;
    if (filtered.isEmpty) return const SizedBox.shrink();

    return Container(
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: ListView.builder(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: filtered.length,
        itemBuilder: (context, index) {
          final member = filtered[index];
          final isSelected = index == _mentionIndex;
          final name = member.nickname ?? member.userId;
          return Material(
            color: isSelected
                ? Theme.of(context).colorScheme.primaryContainer
                : Colors.transparent,
            child: ListTile(
              dense: true,
              leading: CircleAvatar(
                radius: 16,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(fontSize: 14),
                ),
              ),
              title: Text(name, style: const TextStyle(fontSize: 14)),
              onTap: () => _selectMember(member),
            ),
          );
        },
      ),
    );
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final ids = List<String>.from(_mentionedIds);
    _mentionedIds.clear();
    widget.onSend(text, ids);
    _controller.clear();
    _resetMention();
  }

  String _mapError(FailureError error, AppLocalizations loc) {
    return switch (error) {
      UnsupportedCapability(:final capability) => switch (capability) {
          'audio_recording' => loc.errorRecordingNotImplemented,
          'share' => loc.errorShareNotAvailable,
          'clipboard' => loc.errorClipboardNotAvailable,
          _ => loc.commonFailed,
        },
      PermissionDenied(:final capability) => switch (capability) {
          'notification' => loc.errorNotificationPermissionDenied,
          'microphone' => loc.errorMicrophonePermissionDenied,
          _ => loc.commonFailed,
        },
      OperationCancelled() => '',
      UnknownError(:final message) => switch (message) {
          'file_read_failed' => loc.errorFileReadFailed,
          'already_recording' => loc.errorAlreadyRecording,
          'not_recording' => loc.errorNotRecording,
          _ => loc.commonFailed,
        },
    };
  }
}
