import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
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

  final FutureOr<void> Function(String text, List<String> mentionedUserIds)
      onSend;
  final FutureOr<void> Function(UploadResult result) onSendImage;
  final FutureOr<void> Function(UploadResult result) onSendFile;
  final FutureOr<void> Function(UploadResult result) onSendVoice;
  final FocusNode? focusNode;
  final ValueChanged<bool>? onFocusChanged;
  final List<GroupMember>? members;

  @override
  ConsumerState<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends ConsumerState<MessageInput> {
  final _controller = TextEditingController();
  bool _isUploading = false;
  bool _isSending = false;
  bool _isRecording = false;
  bool _showEmojiPanel = false;

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
    FutureOr<void> Function(UploadResult) callback,
  ) async {
    setState(() => _isUploading = true);

    try {
      final fileApi = ref.read(fileApiProvider);
      final uploadResult = await _uploadFile(fileApi, file);
      await Future.sync(() => callback(uploadResult));
    } catch (_) {
      if (mounted) {
        final loc = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.commonFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
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
        if (_showEmojiPanel) _buildEmojiPanel(),
        Container(
          decoration: BoxDecoration(
            color: ImTokens.wechatPanelBg,
            border: Border(top: BorderSide(color: theme.dividerColor)),
          ),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
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
                  child: _InputIconButton(
                    icon: Icons.add_circle_outline,
                    onPressed: _isUploading ? null : _showAttachmentMenu,
                    tooltip: loc.a11yAddAttachment,
                  ),
                ),
                Semantics(
                  label: 'Emoji',
                  button: true,
                  child: _InputIconButton(
                    icon: Icons.emoji_emotions_outlined,
                    onPressed: _isUploading || _isSending
                        ? null
                        : () => setState(
                              () => _showEmojiPanel = !_showEmojiPanel,
                            ),
                    tooltip: 'Emoji',
                  ),
                ),
                Semantics(
                  label: loc.a11yVoiceInput,
                  button: true,
                  child: _InputIconButton(
                    icon: _isRecording ? Icons.stop : Icons.mic,
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
                      textInputAction: TextInputAction.send,
                      keyboardType: TextInputType.multiline,
                      decoration: InputDecoration(
                        hintText: loc.chatInputHint,
                        filled: true,
                        fillColor: ImTokens.wechatInputBg,
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
                    onPressed: _isUploading || _isSending ? null : _handleSend,
                    style: FilledButton.styleFrom(
                      backgroundColor: ImTokens.wechatGreen,
                      disabledBackgroundColor:
                          ImTokens.wechatGreen.withValues(alpha: 0.38),
                      foregroundColor: Colors.white,
                      minimumSize: const Size(48, 42),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    child: _isSending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send, size: 20),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmojiPanel() {
    const emojis = ['😀', '😂', '👍', '🙏', '❤️', '🎉', '😮', '😢'];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: ImTokens.wechatPanelBg,
        border: Border(
          top: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final emoji in emojis)
            InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: () {
                final selection = _controller.selection;
                final text = _controller.text;
                final offset =
                    selection.isValid ? selection.baseOffset : text.length;
                _controller.text = text.replaceRange(offset, offset, emoji);
                _controller.selection = TextSelection.collapsed(
                  offset: offset + emoji.length,
                );
                widget.focusNode?.requestFocus();
              },
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Text(emoji, style: const TextStyle(fontSize: 22)),
              ),
            ),
        ],
      ),
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
            color: isSelected ? ImTokens.wechatSelectedBg : Colors.transparent,
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

  Future<void> _handleSend() async {
    if (_isSending || _isUploading) return;
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final ids = List<String>.from(_mentionedIds);
    setState(() => _isSending = true);
    try {
      await Future.sync(() => widget.onSend(text, ids));
      _mentionedIds.clear();
      _controller.clear();
      _resetMention();
      if (_showEmojiPanel) setState(() => _showEmojiPanel = false);
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
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

class _InputIconButton extends StatelessWidget {
  const _InputIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.color,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(icon),
      onPressed: onPressed,
      tooltip: tooltip,
      color: color ?? ImTokens.wechatIcon,
      style: ButtonStyle(
        minimumSize: WidgetStateProperty.all(const Size(42, 42)),
        fixedSize: WidgetStateProperty.all(const Size(42, 42)),
        padding: WidgetStateProperty.all(EdgeInsets.zero),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return ImTokens.wechatTextTertiary;
          }
          if (color != null) return color;
          if (states.contains(WidgetState.hovered) ||
              states.contains(WidgetState.pressed)) {
            return ImTokens.wechatGreen;
          }
          return ImTokens.wechatIcon;
        }),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.hovered)) {
            return ImTokens.wechatHoverBg;
          }
          return Colors.transparent;
        }),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      ),
    );
  }
}
