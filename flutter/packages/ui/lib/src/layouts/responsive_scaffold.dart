import 'dart:ui';
import 'package:flutter/material.dart';
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

  Widget _buildDesktop(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Row(
        children: [
          ClipRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface.withAlpha(230),
                  border: Border(
                    right: BorderSide(
                      color: theme.colorScheme.outlineVariant.withAlpha(80),
                    ),
                  ),
                ),
                child: NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onDestinationSelected,
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: Colors.transparent,
                  destinations: destinations
                      .map((d) => NavigationRailDestination(
                            icon: Icon(d.icon),
                            selectedIcon: d.selectedIcon != null
                                ? Icon(d.selectedIcon)
                                : null,
                            label: Text(d.label),
                          ))
                      .toList(),
                ),
              ),
            ),
          ),
          const VerticalDivider(thickness: 1, width: 1),
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
      floatingActionButton: floatingActionButton,
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
