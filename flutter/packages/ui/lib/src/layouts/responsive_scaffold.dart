import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';
import '../widgets/glass_app_components.dart';
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

    return isDesktop ? _buildDesktop(context) : _buildMobile(context);
  }

  Widget _buildDesktop(BuildContext context) {
    return Scaffold(
      backgroundColor: ImTokens.wechatPageBg,
      body: Row(
        children: [
          _DesktopNavRail(
            destinations: destinations,
            selectedIndex: selectedIndex,
            onDestinationSelected: onDestinationSelected,
            floatingActionButton: floatingActionButton,
          ),
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
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.brightness == Brightness.light
          ? ImTokens.wechatPageBg
          : theme.colorScheme.surfaceContainerHighest,
      appBar: header != null
          ? PreferredSize(
              preferredSize: const Size.fromHeight(56),
              child: header!,
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: child,
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(top: BorderSide(color: theme.dividerColor)),
        ),
        child: SafeArea(
          top: false,
          child: NavigationBar(
            selectedIndex: selectedIndex,
            onDestinationSelected: onDestinationSelected,
            destinations: destinations
                .map(
                  (d) => NavigationDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selectedIcon ?? d.icon),
                    label: d.label,
                  ),
                )
                .toList(),
          ),
        ),
      ),
      floatingActionButton: floatingActionButton,
    );
  }
}

class _DesktopNavRail extends StatelessWidget {
  const _DesktopNavRail({
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    this.floatingActionButton,
  });

  final List<ResponsiveNavDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      color: ImTokens.wechatSidebar,
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 18),
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: ImTokens.wechatGreen,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'IM',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 20),
            for (var i = 0; i < destinations.length; i++)
              FlatLineIconButton(
                icon: i == selectedIndex
                    ? destinations[i].selectedIcon ?? destinations[i].icon
                    : destinations[i].icon,
                tooltip: destinations[i].label,
                selected: i == selectedIndex,
                onPressed: () => onDestinationSelected(i),
              ),
            const Spacer(),
            if (floatingActionButton != null) ...[
              floatingActionButton!,
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}
