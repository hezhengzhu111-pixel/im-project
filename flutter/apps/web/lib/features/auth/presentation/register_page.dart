import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_ui/im_ui.dart' hide GradientButton;
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/agreement_dialog.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_web/features/auth/domain/auth_error_code.dart';
import 'auth_provider.dart';
import 'auth_providers.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage>
    with SingleTickerProviderStateMixin {
  late FormController _formController;
  Locale? _locale;
  bool _agreementAccepted = false;

  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _controller.forward();

    _formController = FormController(FormSchema(fields: []));

    ref.listenManual<AuthState>(authStateProvider, (prev, next) {
      if (!mounted) return;
      if (next.errorCode != null) {
        _formController.setFormError(_locErrorCode(next.errorCode!));
      } else if (prev?.errorCode != null && next.errorCode == null) {
        _formController.setFormError(null);
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context);
    if (_locale != locale) {
      _locale = locale;
      _formController.dispose();
      _formController = _buildFormController();
    }
  }

  FormController _buildFormController() {
    final loc = AppLocalizations.of(context)!;
    return FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'username',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(3, loc.validationUsernameMinLength(3)),
          FormValidators.maxLength(20, loc.validationUsernameMaxLength(20)),
          FormValidators.pattern(
            RegExp(r'^[a-zA-Z0-9_]+$'),
            loc.validationUsernameInvalidChars,
          ),
        ],
      ),
      FormFieldSchema(
        name: 'email',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.email(loc.validationEmailInvalid),
        ],
      ),
      FormFieldSchema(
        name: 'password',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(8, loc.validationPasswordMinLength(8)),
          FormValidators.maxLength(64, loc.validationPasswordMaxLength(64)),
          FormValidators.passwordStrength(loc.validationPasswordStrength),
        ],
      ),
      FormFieldSchema(
        name: 'confirmPassword',
        validators: [
          FormValidators.required(loc.validationRequired),
          (value) {
            final pw = _formController.field('password').value;
            if (value != pw) return loc.validationPasswordMismatch;
            return null;
          },
        ],
      ),
    ]));
  }

  String _locErrorCode(AuthErrorCode code) {
    final loc = AppLocalizations.of(context)!;
    switch (code) {
      case AuthErrorCode.invalidCredentials:
        return loc.authInvalidCredentials;
      case AuthErrorCode.networkError:
        return loc.authNetworkError;
      case AuthErrorCode.serverError:
        return loc.authServerError;
      case AuthErrorCode.tooManyRequests:
        return loc.authTooManyRequests;
      case AuthErrorCode.unknown:
        return loc.authUnknownError;
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final loc = AppLocalizations.of(context)!;
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return Scaffold(
      body: GradientBackground(
        colors: glass.gradientColors,
        animated: true,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: context.isMobile
                ? _buildMobileLayout(authState, loc)
                : _buildDesktopLayout(authState, loc),
          ),
        ),
      ),
    );
  }

  Widget _buildMobileLayout(AuthState authState, AppLocalizations loc) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: AuthCard(
          title: loc.registerTitle,
          subtitle: loc.registerSubtitle,
          child: _buildForm(authState, loc),
        ),
      ),
    );
  }

  Widget _buildDesktopLayout(AuthState authState, AppLocalizations loc) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: AuthCard(
            title: loc.registerTitle,
            subtitle: loc.registerSubtitle,
            child: _buildForm(authState, loc),
          ),
        ),
      ),
    );
  }

  Widget _buildForm(AuthState authState, AppLocalizations loc) {
    return ValidatedForm(
      controller: _formController,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ValidatedFormField(
            controller: _formController,
            name: 'username',
            label: loc.loginUsername,
            icon: Icons.person,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'email',
            label: loc.registerEmail,
            icon: Icons.email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock,
            obscureText: true,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          ValidatedFormField(
            controller: _formController,
            name: 'confirmPassword',
            label: loc.registerConfirmPassword,
            icon: Icons.lock,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onSubmitted: _register,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                height: 24,
                width: 24,
                child: Checkbox(
                  value: _agreementAccepted,
                  onChanged: (value) {
                    setState(() {
                      _agreementAccepted = value ?? false;
                    });
                  },
                  activeColor: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Wrap(
                  children: [
                    Text(
                      loc.registerAgreementPrefix,
                      style: const TextStyle(fontSize: 14),
                    ),
                    GestureDetector(
                      onTap: () => AgreementDialog.show(
                        context,
                        loc.registerUserAgreement,
                        loc.registerUserAgreementContent,
                      ),
                      child: Text(
                        loc.registerUserAgreement,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                          fontSize: 14,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                    Text(
                      loc.registerAgreementSuffix,
                      style: const TextStyle(fontSize: 14),
                    ),
                    GestureDetector(
                      onTap: () => AgreementDialog.show(
                        context,
                        loc.registerPrivacyPolicy,
                        loc.registerPrivacyPolicyContent,
                      ),
                      child: Text(
                        loc.registerPrivacyPolicy,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                          fontSize: 14,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          GradientButton(
            text: loc.registerButton,
            isLoading: authState.isLoading,
            onPressed: _register,
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => context.go('/login'),
            child: Text(loc.registerHasAccountLogin),
          ),
        ],
      ),
    );
  }

  void _register() async {
    final loc = AppLocalizations.of(context)!;
    if (ref.read(authStateProvider).isLoading) return;

    if (!_agreementAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.registerAgreementRequired)),
      );
      return;
    }

    final valid = await _formController.validate();
    if (!valid) return;

    final values = _formController.values;
    await ref.read(authStateProvider.notifier).register(
          values['username']!.trim(),
          values['email']!.trim(),
          values['password']!,
        );
    if (!mounted) return;
    final state = ref.read(authStateProvider);
    if (state.errorCode == null && state.error == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.commonSuccess)),
      );
      try {
        context.go('/login');
      } catch (_) {
        // Tests may mount this page without a GoRouter.
      }
    }
  }

  @override
  void dispose() {
    _formController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
