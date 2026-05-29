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

  Widget _buildDesktop(BuildContext context, ThemeData theme) {
    return Scaffold(
      body: Row(
        children: [
          // Left nav — white base + right shadow
          Container(
            width: 88,
            decoration: const BoxDecoration(
              color: Colors.white,
              boxShadow: [ImTokens.navRightShadow],
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
                    indicatorColor: Colors.transparent,
                    leading: floatingActionButton,
                    selectedIconTheme: IconThemeData(
                      color: ImTokens.brandPurple,
                      size: 24,
                    ),
                    unselectedIconTheme: IconThemeData(
                      color: Colors.blueGrey.shade400,
                      size: 24,
                    ),
                    selectedLabelTextStyle: TextStyle(
                      fontSize: ImTokens.textSm,
                      fontWeight: FontWeight.w600,
                      color: ImTokens.brandPurple,
                    ),
                    unselectedLabelTextStyle: TextStyle(
                      fontSize: ImTokens.textSm,
                      color: Colors.blueGrey.shade400,
                    ),
                    destinations: destinations.map((d) {
                      final isSelected = destinations.indexOf(d) == selectedIndex;
                      return NavigationRailDestination(
                        icon: _NavCapsule(
                          isSelected: isSelected,
                          child: Icon(d.icon, size: 24),
                        ),
                        selectedIcon: _NavCapsule(
                          isSelected: true,
                          child: Icon(d.selectedIcon ?? d.icon, size: 24),
                        ),
                        label: Text(d.label),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          // Right content area
          Expanded(
            child: Column(
              children: [
                if (header != null) header!,
                Expanded(child: child),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMobile(BuildContext context) {
    return Scaffold(
      appBar: header != null
          ? PreferredSize(preferredSize: const Size.fromHeight(56), child: header!)
          : null,
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        destinations: destinations
            .map((d) => NavigationDestination(
                  icon: Icon(d.icon),
                  selectedIcon: d.selectedIcon != null
                      ? Icon(d.selectedIcon)
                      : null,
                  label: d.label,
                ))
            .toList(),
      ),
      floatingActionButton: floatingActionButton,
    );
  }
}

/// 导航栏选中态胶囊 — 纯白背景 + 紫色弥散阴影
class _NavCapsule extends StatelessWidget {
  const _NavCapsule({
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
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [ImTokens.capsuleGlowShadow],
      ),
      child: Center(child: child),
    );
  }
}
