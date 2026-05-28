import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

class FormErrorBanner extends StatefulWidget {
  final FormController controller;
  final bool dismissible;

  const FormErrorBanner({
    super.key,
    required this.controller,
    this.dismissible = true,
  });

  @override
  State<FormErrorBanner> createState() => _FormErrorBannerState();
}

class _FormErrorBannerState extends State<FormErrorBanner> {
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant FormErrorBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (widget.controller.formError != null) {
      setState(() => _dismissed = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final formError = widget.controller.formError;

        if (formError == null || _dismissed) {
          return const SizedBox.shrink();
        }

        final colorScheme = Theme.of(context).colorScheme;

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: colorScheme.errorContainer,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colorScheme.error),
          ),
          child: Row(
            children: [
              Icon(
                Icons.error_outline,
                color: colorScheme.error,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  formError,
                  style: TextStyle(
                    color: colorScheme.onErrorContainer,
                    fontSize: 14,
                  ),
                ),
              ),
              if (widget.dismissible)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() => _dismissed = true),
                  color: colorScheme.error,
                ),
            ],
          ),
        );
      },
    );
  }
}
