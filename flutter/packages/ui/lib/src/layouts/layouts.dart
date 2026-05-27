import 'package:flutter/material.dart';

/// 侧边栏导航布局
class SideNavLayout extends StatelessWidget {
  const SideNavLayout({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.child,
    this.header,
    this.footer,
    this.railWidth = 72,
  });

  final List<NavDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget child;
  final Widget? header;
  final Widget? footer;
  final double railWidth;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // 侧边导航栏
          Container(
            width: railWidth,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                right: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
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
                    destinations: destinations
                        .map((d) => NavigationRailDestination(
                              icon: Icon(d.icon),
                              selectedIcon: Icon(d.selectedIcon ?? d.icon),
                              label: Text(d.label),
                            ))
                        .toList(),
                  ),
                ),
                if (footer != null) footer!,
              ],
            ),
          ),
          // 内容区域
          Expanded(child: child),
        ],
      ),
    );
  }
}

/// 导航目的地配置
class NavDestination {
  const NavDestination({
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.badge,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final int? badge;
}

/// 主内容布局（带侧边栏面板）
class MainContentLayout extends StatelessWidget {
  const MainContentLayout({
    super.key,
    this.sidebar,
    required this.content,
    this.sidebarWidth = 320,
    this.showSidebar = true,
  });

  final Widget? sidebar;
  final Widget content;
  final double sidebarWidth;
  final bool showSidebar;

  @override
  Widget build(BuildContext context) {
    if (!showSidebar || sidebar == null) {
      return content;
    }

    return Row(
      children: [
        // 侧边面板
        SizedBox(
          width: sidebarWidth,
          child: sidebar!,
        ),
        // 分隔线
        VerticalDivider(
          width: 1,
          thickness: 1,
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
        // 主内容
        Expanded(child: content),
      ],
    );
  }
}

/// 响应式布局
class ResponsiveLayout extends StatelessWidget {
  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
    this.breakpointTablet = 768,
    this.breakpointDesktop = 1200,
  });

  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;
  final double breakpointTablet;
  final double breakpointDesktop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= breakpointDesktop && desktop != null) {
          return desktop!;
        } else if (constraints.maxWidth >= breakpointTablet && tablet != null) {
          return tablet!;
        } else {
          return mobile;
        }
      },
    );
  }
}

/// 页面头部
class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actions,
    this.leading,
  });

  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
      ),
      child: Row(
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ],
            ),
          ),
          if (actions != null) ...actions!,
        ],
      ),
    );
  }
}

/// 分组列表
class GroupedList extends StatelessWidget {
  const GroupedList({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
  });

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const Spacer(),
              if (trailing != null) trailing!,
            ],
          ),
        ),
        ...children,
      ],
    );
  }
}

/// 可折叠面板
class CollapsiblePanel extends StatefulWidget {
  const CollapsiblePanel({
    super.key,
    required this.title,
    required this.child,
    this.initiallyExpanded = true,
    this.trailing,
  });

  final String title;
  final Widget child;
  final bool initiallyExpanded;
  final Widget? trailing;

  @override
  State<CollapsiblePanel> createState() => _CollapsiblePanelState();
}

class _CollapsiblePanelState extends State<CollapsiblePanel> {
  late bool _isExpanded;

  @override
  void initState() {
    super.initState();
    _isExpanded = widget.initiallyExpanded;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        InkWell(
          onTap: () => setState(() => _isExpanded = !_isExpanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(
                  _isExpanded ? Icons.expand_more : Icons.chevron_right,
                  size: 20,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 8),
                Text(
                  widget.title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const Spacer(),
                if (widget.trailing != null) widget.trailing!,
              ],
            ),
          ),
        ),
        if (_isExpanded) widget.child,
      ],
    );
  }
}
