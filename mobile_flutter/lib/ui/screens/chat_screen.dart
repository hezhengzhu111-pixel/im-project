import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/chat_models.dart';
import '../../state/auth_controller.dart';
import '../../state/chat_controller.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.session,
  });

  final ChatSession session;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _textController = TextEditingController();
  final _imagePicker = ImagePicker();
  final _scrollController = ScrollController();
  bool _showJumpToBottom = false;
  int _newMessageHintCount = 0;
  int _lastMessageCount = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScrollChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final chat = context.read<ChatController>();
      chat.enterSession(widget.session);
      chat.loadMessages(widget.session).then((_) => _jumpToBottom());
    });
  }

  @override
  void dispose() {
    context.read<ChatController>().leaveSession(widget.session);
    _scrollController.removeListener(_onScrollChanged);
    _scrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _textController.text;
    if (text.trim().isEmpty) return;
    _textController.clear();
    await context.read<ChatController>().sendText(widget.session, text);
    _jumpToBottom();
  }

  Future<void> _pickImage() async {
    final chat = context.read<ChatController>();
    final picked = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (picked == null) return;
    try {
      await chat.sendImage(widget.session, picked.path);
      _jumpToBottom();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('图片发送失败')),
      );
    }
  }

  Future<void> _pickFile() async {
    final chat = context.read<ChatController>();
    final result = await FilePicker.platform.pickFiles(withReadStream: false);
    if (result == null || result.files.isEmpty) return;
    final path = result.files.first.path;
    if (path == null || path.isEmpty) return;
    try {
      await chat.sendFile(widget.session, path);
      _jumpToBottom();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('文件发送失败')),
      );
    }
  }

  void _onScrollChanged() {
    if (!_scrollController.hasClients) return;
    final distance = _scrollController.position.maxScrollExtent - _scrollController.offset;
    final show = distance > 240;
    if (show == _showJumpToBottom) return;
    setState(() {
      _showJumpToBottom = show;
      if (!show) {
        _newMessageHintCount = 0;
      }
    });
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    final auth = context.watch<AuthController>();
    final list = chat.messages[widget.session.id] ?? [];
    if (list.length != _lastMessageCount) {
      final hasIncoming = list.length > _lastMessageCount && list.isNotEmpty && list.last.senderId != auth.user?.id;
      _lastMessageCount = list.length;
      if (_showJumpToBottom && hasIncoming) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          setState(() {
            _newMessageHintCount += 1;
          });
        });
      }
    }
    return Scaffold(
      appBar: AppBar(title: Text(widget.session.targetName)),
      floatingActionButton: _showJumpToBottom
          ? FloatingActionButton.small(
              onPressed: _jumpToBottom,
              child: _newMessageHintCount > 0
                  ? Text('$_newMessageHintCount')
                  : const Icon(Icons.keyboard_arrow_down),
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: chat.loadingMessages
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    itemCount: list.length + 1,
                    itemBuilder: (_, index) {
                      if (index == 0) {
                        final hasMore = chat.hasMoreHistory[widget.session.id] != false;
                        return Align(
                          child: TextButton(
                            onPressed: (!hasMore || chat.loadingMoreMessages)
                                ? null
                                : () => chat.loadMoreMessages(widget.session),
                            child: Text(chat.loadingMoreMessages ? '加载中...' : (hasMore ? '加载更早消息' : '没有更多消息')),
                          ),
                        );
                      }
                      final msg = list[index - 1];
                      final isSelf = msg.senderId == auth.user?.id;
                      return Align(
                        alignment: isSelf ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                          decoration: BoxDecoration(
                            color: isSelf ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: _MessageBody(
                            session: widget.session,
                            message: msg,
                            isSelf: isSelf,
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (chat.sendingMedia)
                    Row(
                      children: [
                        Expanded(
                          child: LinearProgressIndicator(value: chat.uploadProgress <= 0 ? null : chat.uploadProgress),
                        ),
                        TextButton(
                          onPressed: chat.cancelUpload,
                          child: const Text('取消上传'),
                        ),
                      ],
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          decoration: const InputDecoration(hintText: '输入消息'),
                          minLines: 1,
                          maxLines: 4,
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        onPressed: chat.sendingMedia ? null : _pickImage,
                        icon: const Icon(Icons.image_outlined),
                      ),
                      IconButton(
                        onPressed: chat.sendingMedia ? null : _pickFile,
                        icon: const Icon(Icons.attach_file),
                      ),
                      FilledButton(onPressed: _send, child: const Text('发送')),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({
    required this.session,
    required this.message,
    required this.isSelf,
  });

  final ChatSession session;
  final ChatMessage message;
  final bool isSelf;

  @override
  Widget build(BuildContext context) {
    if (message.isImage && message.mediaUrl != null && message.mediaUrl!.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              message.mediaUrl!,
              width: 180,
              height: 180,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox(
                width: 180,
                height: 180,
                child: Center(child: Icon(Icons.broken_image_outlined)),
              ),
            ),
          ),
          if (message.status == 'FAILED')
            _RetryAction(session: session, message: message),
          if (isSelf)
            _ReadStatusText(message: message),
        ],
      );
    }
    if (message.isFile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.insert_drive_file_outlined, size: 16),
              const SizedBox(width: 6),
              Flexible(child: Text(message.mediaName ?? message.content)),
            ],
          ),
          if (message.mediaUrl != null && message.mediaUrl!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                message.mediaUrl!,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          if (message.status == 'FAILED')
            _RetryAction(session: session, message: message),
          if (isSelf)
            _ReadStatusText(message: message),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(message.content),
        if (message.status == 'FAILED')
          _RetryAction(session: session, message: message),
        if (isSelf)
          _ReadStatusText(message: message),
      ],
    );
  }
}

class _ReadStatusText extends StatelessWidget {
  const _ReadStatusText({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    String text = '';
    if (message.readStatus == 1 || message.status == 'READ') {
      text = '已读';
    } else if ((message.readByCount ?? 0) > 0) {
      text = '${message.readByCount}人已读';
    } else if (message.status == 'DELIVERED') {
      text = '已送达';
    } else if (message.status == 'SENT') {
      text = '已发送';
    } else if (message.status == 'SENDING') {
      text = '发送中';
    } else if (message.status == 'FAILED') {
      text = '发送失败';
    }
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}

class _RetryAction extends StatelessWidget {
  const _RetryAction({
    required this.session,
    required this.message,
  });

  final ChatSession session;
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () {
        final chat = context.read<ChatController>();
        chat.retryMessage(session, message);
      },
      icon: const Icon(Icons.refresh, size: 16),
      label: const Text('重发'),
    );
  }
}
