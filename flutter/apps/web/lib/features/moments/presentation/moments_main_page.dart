import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'feed/moments_feed_page.dart';
import 'composer/moments_composer_page.dart';
import 'widgets/moments_cover.dart';
import 'widgets/moments_topbar.dart';
import 'widgets/moments_sidebar.dart';

class MomentsMainPage extends StatefulWidget {
  const MomentsMainPage({super.key});

  @override
  State<MomentsMainPage> createState() => _MomentsMainPageState();
}

class _MomentsMainPageState extends State<MomentsMainPage> {
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
    final threshold = 192.0; // cover height - topbar height
    final progress = (_scrollController.offset / threshold).clamp(0.0, 1.0);
    if (progress != _scrollProgress) {
      setState(() => _scrollProgress = progress);
    }
  }

  void _openComposer() {
    if (!context.isCompact) {
      // Desktop: dialog
      showDialog(
        context: context,
        builder: (_) => Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: const MomentsComposerPage(),
          ),
        ),
      );
    } else {
      // Mobile: full screen
      Navigator.of(context).push(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => const MomentsComposerPage(),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final showSidebar = context.isLarge;

    return Scaffold(
      body: Row(
        children: [
          // Main panel
          Expanded(
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
                        child: MomentsCover(
                          nickname: AppLocalizations.of(context)!.momentsUserFallback,
                        ),
                      ),
                      SliverFillRemaining(
                        child: MomentsFeedPage(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Sidebar (desktop only)
          if (showSidebar)
            const VerticalDivider(thickness: 1, width: 1),
          if (showSidebar)
            MomentsSidebar(onComposeTap: _openComposer),
        ],
      ),
    );
  }
}
