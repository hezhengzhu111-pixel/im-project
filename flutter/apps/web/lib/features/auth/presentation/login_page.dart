import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/ui.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'auth_provider.dart';
import 'auth_providers.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  late FormController _formController;
  bool _rememberMe = false;

  late AnimationController _animController;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnim = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    ));
    _animController.forward();
  }

  @override
  void dispose() {
    _formController.dispose();
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    _formController = FormController(FormSchema(fields: [
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
        name: 'password',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(8, loc.validationPasswordMinLength(8)),
          FormValidators.maxLength(64, loc.validationPasswordMaxLength(64)),
          FormValidators.passwordStrength(loc.validationPasswordStrength),
        ],
      ),
    ]));

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (next.error != null && mounted) {
        _formController.setFormError(next.error);
      }
    });

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF667eea),
              Color(0xFF764ba2),
            ],
          ),
        ),
        child: DecorativeBackground(
          child: FadeTransition(
            opacity: _fadeAnim,
            child: SlideTransition(
              position: _slideAnim,
              child: context.isMobile
                  ? _buildMobileLayout(loc)
                  : _buildDesktopLayout(loc),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMobileLayout(AppLocalizations loc) {
    return Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(ImTokens.space6),
        child: AuthCard(
          title: loc.loginTitle,
          subtitle: loc.loginSubtitle,
          child: _buildForm(loc),
        ),
      ),
    );
  }

  Widget _buildDesktopLayout(AppLocalizations loc) {
    return Row(
      children: [
        const Expanded(child: BrandShowcase()),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(ImTokens.space6),
              child: AuthCard(
                title: loc.loginTitle,
                subtitle: loc.loginSubtitle,
                child: _buildForm(loc),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AppLocalizations loc) {
    return ValidatedForm(
      controller: _formController,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ValidatedFormField(
            controller: _formController,
            name: 'username',
            label: loc.loginUsername,
            icon: Icons.person_outline,
          ),
          SizedBox(height: ImTokens.space4),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock_outline,
            obscureText: true,
          ),
          SizedBox(height: ImTokens.space3),
          Row(
            children: [
              Checkbox(
                value: _rememberMe,
                onChanged: (v) => setState(() => _rememberMe = v ?? false),
                activeColor: ImColors.light.primary,
              ),
              Text(loc.loginRememberMe),
            ],
          ),
          SizedBox(height: ImTokens.space4),
          GradientButton(
            text: loc.loginButton,
            isLoading: ref.watch(authStateProvider).isLoading,
            onPressed: _login,
          ),
          SizedBox(height: ImTokens.space4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('${loc.loginNoAccount} ${loc.loginRegister}'),
              GradientButton(
                text: loc.loginRegister,
                onPressed: () => context.go('/register'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _login() async {
    final valid = await _formController.validate();
    if (!valid) return;

    final values = _formController.values;
    await ref.read(authStateProvider.notifier).login(
          values['username']!.trim(),
          values['password']!,
          rememberMe: _rememberMe,
        );
  }
}
