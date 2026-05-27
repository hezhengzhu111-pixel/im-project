import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../moments_interactions_provider.dart';

class LikeBar extends ConsumerStatefulWidget {
  const LikeBar({required this.postId, super.key});

  final String postId;

  @override
  ConsumerState<LikeBar> createState() => _LikeBarState();
}

class _LikeBarState extends ConsumerState<LikeBar> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(momentsInteractionsProvider(widget.postId).notifier).loadLikes();
    });
  }

  @override
  Widget build(BuildContext context) {
    final interactions = ref.watch(momentsInteractionsProvider(widget.postId));
    final theme = Theme.of(context);

    if (interactions.loadingLikes) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: SizedBox(
          height: 16,
          width: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    if (interactions.likes.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.star, size: 16, color: theme.colorScheme.primary),
          const SizedBox(width: 6),
          Expanded(
            child: Wrap(
              spacing: 2,
              children: interactions.likes.map((like) {
                return Text(
                  '${like.userNickname ?? like.userName ?? "用户"}${like != interactions.likes.last ? "," : ""}',
                  style: TextStyle(
                    fontSize: 14,
                    color: theme.colorScheme.primary,
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
