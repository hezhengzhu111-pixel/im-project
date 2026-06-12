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

    return isDesktop ? _buildDesktop(context) : _buildMobile(context);
  }

  Widget _buildDesktop(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerHighest,
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
      backgroundColor: theme.colorScheme.surfaceContainerHighest,
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
              _DesktopNavButton(
                icon: i == selectedIndex
                    ? destinations[i].selectedIcon ?? destinations[i].icon
                    : destinations[i].icon,
                label: destinations[i].label,
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

class _DesktopNavButton extends StatelessWidget {
  const _DesktopNavButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final color = selected ? ImTokens.wechatGreen : const Color(0xFF9A9A9A);
    return Tooltip(
      message: label,
      child: InkWell(
        onTap: onPressed,
        child: Container(
          width: 64,
          height: 58,
          decoration: BoxDecoration(
            border: selected
                ? const Border(
                    left: BorderSide(
                      color: ImTokens.wechatGreen,
                      width: 3,
                    ),
                  )
                : null,
          ),
          child: Icon(icon, color: color, size: 25),
        ),
      ),
    );
  }
}
