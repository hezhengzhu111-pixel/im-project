import 'package:flutter/material.dart';

class MessageInput extends StatefulWidget {
  const MessageInput({
    required this.onSend,
    this.onSendImage,
    this.onSendFile,
    super.key,
  });

  final ValueChanged<String> onSend;
  final ValueChanged<String>? onSendImage;
  final ValueChanged<String>? onSendFile;

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  bool _isRecording = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  void _showAttachmentMenu() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.image),
              title: const Text('Image'),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendImage();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: const Text('File'),
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

  void _pickAndSendImage() {
    // TODO: integrate file_picker for proper file selection on web
    widget.onSendImage?.call('image');
  }

  void _pickAndSendFile() {
    // TODO: integrate file_picker for proper file selection on web
    widget.onSendFile?.call('file');
  }

  @override
  Widget build(BuildContext context) {
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
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: _showAttachmentMenu,
            tooltip: 'Attach',
          ),
          IconButton(
            icon: Icon(_isRecording ? Icons.stop : Icons.mic),
            onPressed: () {
              setState(() => _isRecording = !_isRecording);
              // TODO: implement actual voice recording
            },
            tooltip: 'Voice',
            color: _isRecording ? Colors.red : null,
          ),
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'Type a message...',
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12),
              ),
              minLines: 1,
              maxLines: 4,
              onSubmitted: (_) => _handleSend(),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.send),
            onPressed: _handleSend,
            color: Theme.of(context).colorScheme.primary,
          ),
        ],
      ),
    );
  }
}
