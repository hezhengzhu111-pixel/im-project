import 'dart:ui';
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
      return _buildDesktop(context, Theme.of(context));
    }
    return _buildMobile(context);
  }

  // ─────────────────────────────────────────────────────────────
  // [重构要求 1] 全局背景：四色渐变包裹整个 Scaffold
  // ─────────────────────────────────────────────────────────────
  Widget _buildDesktop(BuildContext context, ThemeData theme) {
    return Scaffold(
      // Scaffold 自身透明，让渐变背景透出
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF667eea), // 蓝紫
              Color(0xFF764ba2), // 品牌紫
              Color(0xFF23a6d5), // 青色
              Color(0xFF23d5ab), // 绿青
            ],
          ),
        ),
        child: Row(
          children: [
            // ───────────────────────────────────────────────────
            // [重构要求 2] 导航栏：毛玻璃效果
            // ───────────────────────────────────────────────────
            _buildGlassNavRail(context, theme),
            // ───────────────────────────────────────────────────
            // [重构要求 4] 主内容区：浅灰紫背景 + 白卡片
            // ───────────────────────────────────────────────────
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF7F8FA), // 浅灰紫背景
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
                child: ClipRRect(
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(20),
                    bottomLeft: Radius.circular(20),
                  ),
                  child: Column(
                    children: [
                      if (header != null) header!,
                      Expanded(child: child),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // [重构要求 2] 导航栏：毛玻璃 + [重构要求 3] 选中态胶囊
  // ─────────────────────────────────────────────────────────────
  Widget _buildGlassNavRail(BuildContext context, ThemeData theme) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 15.0, sigmaY: 15.0),
        child: Container(
          width: 88,
          // 半透明白色，让渐变背景透过来形成毛玻璃效果
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.15),
          ),
          child: Column(
            children: [
              if (header != null) header!,
              Expanded(
                child: NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onDestinationSelected,
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: Colors.transparent,
                  // [重构要求 3] 禁用默认指示器，用自定义胶囊替代
                  indicatorColor: Colors.transparent,
                  leading: floatingActionButton,
                  // [重构要求 3] 选中图标：品牌深紫色
                  selectedIconTheme: const IconThemeData(
                    color: Color(0xFF764BA2),
                    size: 24,
                  ),
                  unselectedIconTheme: IconThemeData(
                    color: Colors.white.withOpacity(0.6),
                    size: 24,
                  ),
                  selectedLabelTextStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF764BA2),
                  ),
                  unselectedLabelTextStyle: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.6),
                  ),
                  destinations: destinations.map((d) {
                    final isSelected =
                        destinations.indexOf(d) == selectedIndex;
                    return NavigationRailDestination(
                      icon: _CyberCapsule(
                        isSelected: isSelected,
                        child: Icon(
                          d.icon,
                          size: 24,
                          color: isSelected
                              ? const Color(0xFF764BA2)
                              : Colors.white.withOpacity(0.6),
                        ),
                      ),
                      selectedIcon: _CyberCapsule(
                        isSelected: true,
                        child: Icon(
                          d.selectedIcon ?? d.icon,
                          size: 24,
                          color: const Color(0xFF764BA2),
                        ),
                      ),
                      label: Text(d.label),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 移动端：保持简洁，底部导航栏
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
// [重构要求 3] 赛博悬浮胶囊 — 纯白 StadiumBorder + 紫色弥散阴影
// ═════════════════════════════════════════════════════════════════
class _CyberCapsule extends StatelessWidget {
  const _CyberCapsule({
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

    // 选中态：纯白胶囊 + 品牌紫色弥散发光阴影
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        // 纯白胶囊背景
        color: Colors.white,
        // StadiumBorder 等效的圆角
        borderRadius: BorderRadius.circular(16),
        // [重构要求 3] 品牌紫色弥散阴影 — 悬浮发光效果
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
