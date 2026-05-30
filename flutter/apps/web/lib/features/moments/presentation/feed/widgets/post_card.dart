import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:im_web/core/utils/time_formatter.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'media_grid.dart';
import 'image_viewer.dart';
import 'like_bar.dart';
import 'comment_section.dart';

class PostCard extends StatefulWidget {
  const PostCard({
    required this.post,
    required this.onLike,
    super.key,
  });

  final PostWithDetails post;
  final VoidCallback onLike;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> {
  bool _showComments = false;
  bool _isExpanded = false;

  bool get _shouldTruncate {
    final content = widget.post.post.content;
    if (content.isEmpty) return false;
    return content.length > 200;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      color: theme.colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: avatar + nickname
            Row(
              children: [
                CircleAvatar(
                  radius: 21,
                  backgroundImage: widget.post.userAvatar != null
                      ? NetworkImage(widget.post.userAvatar!)
                      : null,
                  child: widget.post.userAvatar == null
                      ? Text(
                          (widget.post.userNickname ?? widget.post.post.userName ?? '?').substring(0, 1).toUpperCase(),
                          style: const TextStyle(fontSize: 14),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.post.userNickname ?? widget.post.post.userName ?? loc.momentsUserFallback,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        _formatTime(widget.post.post.createTime),
                        style: TextStyle(
                          color: theme.colorScheme.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Content
            if (widget.post.post.content.isNotEmpty)
              _buildContent(theme, loc),

            // Media
            if (widget.post.media != null && widget.post.media!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: MediaGrid(
                  media: widget.post.media!,
                  onImageTap: (index) {
                    final imageUrls = widget.post.media!
                        .where((m) => m.type == 0)
                        .map((m) => m.url)
                        .toList();
                    if (imageUrls.isNotEmpty) {
                      ImageViewerOverlay.show(
                        context,
                        imageUrls: imageUrls,
                        initialIndex: index,
                      );
                    }
                  },
                ),
              ),

            // Link card
            if (widget.post.post.linkUrl != null)
              _buildLinkCard(theme),

            // Location
            if (widget.post.post.location != null)
              _buildLocation(theme),

            const SizedBox(height: 12),

            // Actions: time + like/comment buttons
            Row(
              children: [
                Text(
                  _formatTime(widget.post.post.createTime),
                  style: TextStyle(
                    fontSize: 13,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const Spacer(),
                _buildLikeButton(theme),
                const SizedBox(width: 8),
                _buildCommentButton(theme),
              ],
            ),

            // Social area
            if ((widget.post.likeCount ?? 0) > 0 || _showComments)
              Container(
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((widget.post.likeCount ?? 0) > 0)
                      LikeBar(postId: widget.post.post.id),
                    if (_showComments)
                      CommentSection(postId: widget.post.post.id),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(ThemeData theme, AppLocalizations loc) {
    final content = widget.post.post.content;
    final text = _shouldTruncate && !_isExpanded
        ? '${content.substring(0, 200)}...'
        : content;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          text,
          style: const TextStyle(fontSize: 15, height: 1.6),
        ),
        if (_shouldTruncate && !_isExpanded)
          GestureDetector(
            onTap: () => setState(() => _isExpanded = true),
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                loc.momentsShowFull,
                style: TextStyle(
                  fontSize: 14,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildLinkCard(ThemeData theme) {
    return GestureDetector(
      onTap: () async {
        final url = widget.post.post.linkUrl!;
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            if (widget.post.post.linkCover != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  widget.post.post.linkCover!,
                  width: 56,
                  height: 56,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 56,
                    height: 56,
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: const Icon(Icons.link, size: 24),
                  ),
                ),
              ),
            if (widget.post.post.linkCover != null) const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.post.post.linkTitle ?? widget.post.post.linkUrl!,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.post.post.linkUrl!,
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }

  Widget _buildLocation(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Icon(Icons.location_on_outlined, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 4),
          Text(
            widget.post.post.location!,
            style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildLikeButton(ThemeData theme) {
    final isLiked = widget.post.isLiked ?? false;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: widget.onLike,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isLiked ? Icons.star : Icons.star_border,
              size: 20,
              color: isLiked ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
            ),
            if ((widget.post.likeCount ?? 0) > 0) ...[
              const SizedBox(width: 4),
              Text(
                '${widget.post.likeCount}',
                style: TextStyle(
                  fontSize: 13,
                  color: isLiked ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCommentButton(ThemeData theme) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => setState(() => _showComments = !_showComments),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              size: 20,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            if ((widget.post.commentCount ?? 0) > 0) ...[
              const SizedBox(width: 4),
              Text(
                '${widget.post.commentCount}',
                style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(String time) {
    return formatRelativeTime(context, DateTime.parse(time));
  }
}
