import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/src/core/string_extensions.dart';
import '../../utils/time_formatter.dart';
import '../moments_interactions_provider.dart';

class CommentSection extends ConsumerStatefulWidget {
  const CommentSection({required this.postId, super.key});

  final String postId;

  @override
  ConsumerState<CommentSection> createState() => _CommentSectionState();
}

class _CommentSectionState extends ConsumerState<CommentSection> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  String? _replyToId;
  String? _replyToName;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(momentsInteractionsProvider(widget.postId).notifier)
          .loadComments();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startReply(String commentId, String nickname) {
    setState(() {
      _replyToId = commentId;
      _replyToName = nickname;
    });
    _focusNode.requestFocus();
  }

  void _cancelReply() {
    setState(() {
      _replyToId = null;
      _replyToName = null;
    });
  }

  Future<void> _submitComment() async {
    final content = _controller.text.trim();
    if (content.isEmpty) return;

    final result = await ref
        .read(momentsInteractionsProvider(widget.postId).notifier)
        .addComment(content: content, parentId: _replyToId);

    if (result != null) {
      _controller.clear();
      _cancelReply();
    }
  }

  Future<void> _deleteComment(String commentId) async {
    final loc = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.commentDeleteConfirmTitle),
        content: Text(loc.commentDeleteConfirmMessage),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(loc.commonCancel)),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(loc.commentDelete)),
        ],
      ),
    );
    if (confirmed == true) {
      await ref
          .read(momentsInteractionsProvider(widget.postId).notifier)
          .deleteComment(commentId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final interactions = ref.watch(momentsInteractionsProvider(widget.postId));
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Reply hint
        if (_replyToName != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              children: [
                Text(
                  '${loc.commentReply} $_replyToName',
                  style: TextStyle(
                    fontSize: 13,
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: _cancelReply,
                  child: Icon(Icons.close,
                      size: 16, color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),

        // Input
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  hintText: _replyToName != null
                      ? '${loc.commentReply} $_replyToName...'
                      : loc.commentWriteHint,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: theme.colorScheme.surfaceContainerHighest,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  isDense: true,
                ),
                style: const TextStyle(fontSize: 14),
                onSubmitted: (_) => _submitComment(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed:
                  _controller.text.trim().isEmpty ? null : _submitComment,
              icon: const Icon(Icons.send),
              style: IconButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: theme.colorScheme.onPrimary,
              ),
            ),
          ],
        ),

        const SizedBox(height: 8),

        // Comments list
        if (interactions.loadingComments)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(
                child: SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))),
          )
        else if (interactions.comments.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              loc.commentNoComments,
              style: TextStyle(
                  fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
            ),
          )
        else
          ...interactions.comments
              .map((comment) => _buildCommentItem(context, comment)),
      ],
    );
  }

  Widget _buildCommentItem(BuildContext context, MomentComment comment) {
    final theme = Theme.of(context);
    final isOwner = ref.read(authStateProvider).user?.id == comment.userId;
    final loc = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundImage: comment.userAvatar != null
                ? NetworkImage(comment.userAvatar!)
                : null,
            child: comment.userAvatar == null
                ? Text(
                    (comment.userNickname ?? comment.userName ?? '?')
                        .safeFirstCharUpper(),
                    style: const TextStyle(fontSize: 12))
                : null,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      comment.userNickname ??
                          comment.userName ??
                          loc.momentsUserFallback,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _formatTime(comment.createTime),
                      style: TextStyle(
                          fontSize: 12,
                          color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  comment.content,
                  style: const TextStyle(fontSize: 14, height: 1.5),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    GestureDetector(
                      onTap: () => _startReply(
                          comment.id,
                          comment.userNickname ??
                              comment.userName ??
                              loc.momentsUserFallback),
                      child: Text(
                        loc.commentReply,
                        style: TextStyle(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                    if (isOwner) ...[
                      const SizedBox(width: 12),
                      GestureDetector(
                        onTap: () => _deleteComment(comment.id),
                        child: Text(
                          loc.commentDelete,
                          style: TextStyle(
                              fontSize: 12, color: theme.colorScheme.error),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(String time) {
    final parsed = DateTime.tryParse(time);
    if (parsed != null) {
      return formatRelativeTime(context, parsed);
    }
    return time;
  }
}
