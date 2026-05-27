import 'package:flutter/material.dart';
import 'package:im_web/core/utils/responsive.dart';

class AuthCard extends StatelessWidget {
  final Widget child;
  final String title;
  final String subtitle;

  const AuthCard({
    super.key,
    required this.child,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: ResponsiveLayout.getCardElevation(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      margin: EdgeInsets.all(ResponsiveLayout.getCardMargin(context)),
      child: Padding(
        padding: EdgeInsets.all(ResponsiveLayout.getCardPadding(context)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 32),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
