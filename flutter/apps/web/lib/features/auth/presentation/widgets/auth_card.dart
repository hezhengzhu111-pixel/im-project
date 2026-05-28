import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';

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
      elevation: context.breakpoint.value(compact: 0, medium: 0, expanded: 8, large: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      margin: EdgeInsets.all(context.breakpoint.value(compact: 16, medium: 16, expanded: 32, large: 32)),
      child: Padding(
        padding: EdgeInsets.all(context.breakpoint.value(compact: 24, medium: 24, expanded: 32, large: 32)),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: context.breakpoint.value(compact: double.infinity, medium: double.infinity, expanded: 400, large: 400)),
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
