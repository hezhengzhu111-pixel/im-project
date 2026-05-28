import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/chat/presentation/widgets/network_status_banner.dart';
import 'package:im_web/features/chat/data/file_api.dart';
import 'package:im_web/features/chat/data/file_providers.dart';
import 'package:im_web/core/di/platform_providers.dart';

class MessageInput extends ConsumerStatefulWidget {
  const MessageInput({
    super.key,
    required this.onSend,
    required this.onSendImage,
    required this.onSendFile,
    required this.onSendVoice,
    this.focusNode,
    this.onFocusChanged,
  });

  final void Function(String text) onSend;
  final void Function(UploadResult result) onSendImage;
  final void Function(UploadResult result) onSendFile;
  final void Function(UploadResult result) onSendVoice;
  final FocusNode? focusNode;
  final ValueChanged<bool>? onFocusChanged;

  @override
  ConsumerState<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends ConsumerState<MessageInput> {
  final _controller = TextEditingController();
  bool _isUploading = false;
  bool _isRecording = false;

  @override
  void initState() {
    super.initState();
    widget.focusNode?.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    widget.onFocusChanged?.call(widget.focusNode!.hasFocus);
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

    final startResult = await audioRecorder.startRecording();
    if (startResult is Failure) return;

    _showRecordingUI();
  }

  void _showRecordingUI() {
    // 显示录音 UI，包含停止按钮
  }

  Future<void> _stopRecordingAndSend() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);

    final stopResult = await audioRecorder.stopRecording();
    if (stopResult case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendVoice);
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

    return Container(
      padding: const EdgeInsets.all(8.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
      ),
      child: Row(
        children: [
          const OutboxIndicator(),
          Semantics(
            label: loc.a11yAddAttachment,
            button: true,
            child: IconButton(
              icon: const Icon(Icons.add_circle_outline),
              onPressed: _showAttachmentMenu,
              tooltip: loc.a11yAddAttachment,
            ),
          ),
          Semantics(
            label: loc.a11yVoiceInput,
            button: true,
            child: IconButton(
              icon: Icon(_isRecording ? Icons.stop : Icons.mic),
              onPressed: () {
                setState(() => _isRecording = !_isRecording);
              },
              tooltip: loc.a11yVoiceInput,
              color: _isRecording ? Colors.red : null,
            ),
          ),
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: widget.focusNode,
              decoration: InputDecoration(
                hintText: loc.chatInputHint,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              minLines: 1,
              maxLines: 4,
              onSubmitted: (_) => _handleSend(),
            ),
          ),
          Semantics(
            label: loc.a11ySendMessage,
            button: true,
            child: IconButton(
              icon: const Icon(Icons.send),
              onPressed: _handleSend,
              tooltip: loc.a11ySendMessage,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        ],
      ),
    );
  }

  void _handleSend() {
    widget.onSend(_controller.text);
    _controller.clear();
  }
}
