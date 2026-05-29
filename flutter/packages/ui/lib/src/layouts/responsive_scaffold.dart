import 'package:flutter/material.dart';
import '../theme/im_tokens.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

class ResponsiveNavDestination {
  const ResponsiveNavDestination({
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.route,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final String? route;
}

class ResponsiveScaffold extends StatelessWidget {
  const ResponsiveScaffold({
    required this.destinations,
    required this.child,
    required this.selectedIndex,
    required this.onDestinationSelected,
    this.header,
    this.floatingActionButton,
    super.key,
  });

  final List<ResponsiveNavDestination> destinations;
  final Widget child;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget? header;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    final bp = BreakpointScope.of(context);
    final isDesktop = bp == Breakpoint.expanded || bp == Breakpoint.large;

    if (isDesktop) {
      return _buildDesktop(context);
    }
    return _buildMobile(context);
  }

  // ─────────────────────────────────────────────────────────────
  // 桌面布局：四色渐变大背景 + 导航栏 + 内容区
  // ─────────────────────────────────────────────────────────────
  Widget _buildDesktop(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: const BoxDecoration(
          gradient: ImTokens.brandBackgroundGradient,
        ),
        child: Row(
          children: [
            // ── 左侧导航栏 ──
            _buildNavRail(context),
            // ── 右侧主内容区 ──
            Expanded(
              child: Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: ImTokens.pageBackground,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(20),
                    bottomLeft: Radius.circular(20),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 30,
                      offset: const Offset(-4, 0),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    if (header != null) header!,
                    Expanded(child: child),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 导航栏：透明背景 + 白色发光胶囊
  // ─────────────────────────────────────────────────────────────
  Widget _buildNavRail(BuildContext context) {
    return SizedBox(
      width: 88,
      child: Column(
        children: [
          if (header != null) header!,
          Expanded(
            child: NavigationRail(
              selectedIndex: selectedIndex,
              onDestinationSelected: onDestinationSelected,
              labelType: NavigationRailLabelType.all,
              backgroundColor: Colors.transparent,
              indicatorColor: Colors.transparent,
              leading: floatingActionButton,
              selectedIconTheme: const IconThemeData(
                color: ImTokens.brandPrimary,
                size: 24,
              ),
              unselectedIconTheme: IconThemeData(
                color: Colors.blueGrey.shade400,
                size: 24,
              ),
              selectedLabelTextStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ImTokens.brandPrimary,
              ),
              unselectedLabelTextStyle: TextStyle(
                fontSize: 12,
                color: Colors.blueGrey.shade400,
              ),
              destinations: destinations.map((d) {
                final isSelected =
                    destinations.indexOf(d) == selectedIndex;
                return NavigationRailDestination(
                  icon: _GlowCapsule(
                    isSelected: isSelected,
                    child: Icon(
                      d.icon,
                      size: 24,
                      color: isSelected
                          ? ImTokens.brandPrimary
                          : Colors.blueGrey.shade400,
                    ),
                  ),
                  selectedIcon: _GlowCapsule(
                    isSelected: true,
                    child: Icon(
                      d.selectedIcon ?? d.icon,
                      size: 24,
                      color: ImTokens.brandPrimary,
                    ),
                  ),
                  label: Text(d.label),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 移动端：底部导航栏
  // ─────────────────────────────────────────────────────────────
  Widget _buildMobile(BuildContext context) {
    return Scaffold(
      appBar: header != null
          ? PreferredSize(
              preferredSize: const Size.fromHeight(56),
              child: header!,
            )
          : null,
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        destinations: destinations
            .map((d) => NavigationDestination(
                  icon: Icon(d.icon),
                  selectedIcon:
                      d.selectedIcon != null ? Icon(d.selectedIcon) : null,
                  label: d.label,
                ))
            .toList(),
      ),
      floatingActionButton: floatingActionButton,
    );
  }
}

// ═════════════════════════════════════════════════════════════════
// 纯白发光胶囊 — 选中态悬浮发光效果
// ═════════════════════════════════════════════════════════════════
class _GlowCapsule extends StatelessWidget {
  const _GlowCapsule({
    required this.isSelected,
    required this.child,
  });

  final bool isSelected;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!isSelected) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: child,
      );
    }

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF764BA2).withOpacity(0.4),
            blurRadius: 15,
            spreadRadius: 0,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Center(child: child),
    );
  }
}
