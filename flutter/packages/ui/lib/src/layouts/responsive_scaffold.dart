import 'package:flutter/material.dart';

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
      backgroundColor: Colors.transparent,
      body: AppGradientBackground(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Row(
            children: [
              _buildNavRail(context),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  children: [
                    if (header != null) header!,
                    Expanded(
                      child: child,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavRail(BuildContext context) {
    return SizedBox(
      width: 86,
      child: GlassPanel(
        borderRadius: 24,
        backgroundColor: Colors.white.withValues(alpha: 0.12),
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
        child: Column(
          children: [
            if (floatingActionButton != null) ...[
              floatingActionButton!,
              const SizedBox(height: 12),
            ],
            for (var i = 0; i < destinations.length; i++) ...[
              FlatLineIconButton(
                icon: i == selectedIndex
                    ? destinations[i].selectedIcon ?? destinations[i].icon
                    : destinations[i].icon,
                tooltip: destinations[i].label,
                label: destinations[i].label,
                selected: i == selectedIndex,
                onPressed: () => onDestinationSelected(i),
              ),
              const SizedBox(height: 10),
            ],
            const Spacer(),
          ],
        ),
      ),
    );
  }

  Widget _buildMobile(BuildContext context) {
    return Scaffold(
      appBar: header != null
          ? PreferredSize(
              preferredSize: const Size.fromHeight(56),
              child: header!,
            )
          : null,
      body: AppGradientBackground(
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
            child: GlassPanel(
              borderRadius: 22,
              child: child,
            ),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        indicatorColor: imGlassBrand.withValues(alpha: 0.16),
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
      floatingActionButton: floatingActionButton,
    );
  }
}
