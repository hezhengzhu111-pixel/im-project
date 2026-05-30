import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';
import '../../../../core/di/providers.dart';
import 'composer/moments_composer_page.dart';
import 'feed/moments_feed_page.dart';
import 'widgets/moments_cover.dart';
import 'widgets/moments_sidebar.dart';
import 'widgets/moments_topbar.dart';

class MomentsMainPage extends ConsumerStatefulWidget {
  const MomentsMainPage({this.postId, super.key});

  final String? postId;

  @override
  ConsumerState<MomentsMainPage> createState() => _MomentsMainPageState();
}

class _MomentsMainPageState extends ConsumerState<MomentsMainPage> {
  final _scrollController = ScrollController();
  double _scrollProgress = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_updateScrollProgress);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _updateScrollProgress() {
    const threshold = 192.0;
    final progress = (_scrollController.offset / threshold).clamp(0.0, 1.0);
    if (progress != _scrollProgress) {
      setState(() => _scrollProgress = progress);
    }
  }

  void _openComposer() {
    if (!context.isCompact) {
      showDialog(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: GlassPanel(
            borderRadius: 20,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: const MomentsComposerPage(),
            ),
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const MomentsComposerPage(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final showSidebar = context.isLarge;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: GlassPanel(
              backgroundColor: Colors.white.withValues(alpha: 0.18),
              child: Column(
                children: [
                  MomentsTopbar(
                    scrollProgress: _scrollProgress,
                    onComposeTap: _openComposer,
                  ),
                  Expanded(
                    child: CustomScrollView(
                      controller: _scrollController,
                      slivers: [
                        SliverToBoxAdapter(
                          child: Builder(
                            builder: (context) {
                              final user = ref.watch(authStateProvider).user;
                              return MomentsCover(
                                nickname: user?.nickname ?? user?.username ?? AppLocalizations.of(context)!.momentsUserFallback,
                                avatar: user?.avatar,
                              );
                            },
                          ),
                        ),
                        SliverFillRemaining(
                          child: MomentsFeedPage(postId: widget.postId),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (showSidebar) ...[
            const SizedBox(width: 18),
            SizedBox(
              width: 304,
              child: MomentsSidebar(onComposeTap: _openComposer),
            ),
          ],
        ],
      ),
    );
  }
}
