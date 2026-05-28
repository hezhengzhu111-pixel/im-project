import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/form_field.dart';
import 'package:im_web/features/auth/presentation/widgets/agreement_dialog.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'auth_provider.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
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
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final loc = AppLocalizations.of(context)!;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: context.isMobile
                ? const [Color(0xFF667eea), Color(0xFF764ba2)]
                : const [Color(0xFF667eea), Color(0xFF764ba2), Color(0xFF6B73FF)],
          ),
        ),
        child: DecorativeBackground(
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
    return Row(
      children: [
        // 左侧品牌展示区
        const Expanded(
          child: BrandShowcase(),
        ),
        // 右侧注册表单区
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(40),
              child: AuthCard(
                title: loc.registerTitle,
                subtitle: loc.registerSubtitle,
                child: _buildForm(authState, loc),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AuthState authState, AppLocalizations loc) {
    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AuthFormField(
            controller: _usernameController,
            label: loc.loginUsername,
            icon: Icons.person,
            validator: (v) => Validators.validateUsername(v, loc),
          ),
          const SizedBox(height: 16),
          AuthFormField(
            controller: _emailController,
            label: loc.registerEmail,
            icon: Icons.email,
            validator: (v) => Validators.validateEmail(v, loc),
          ),
          const SizedBox(height: 16),
          AuthFormField(
            controller: _passwordController,
            label: loc.loginPassword,
            icon: Icons.lock,
            obscureText: true,
            validator: (v) => Validators.validatePassword(v, loc),
          ),
          const SizedBox(height: 16),
          AuthFormField(
            controller: _confirmPasswordController,
            label: loc.registerConfirmPassword,
            icon: Icons.lock,
            obscureText: true,
            validator: (v) => Validators.validateConfirmPassword(
                v, _passwordController.text, loc),
          ),
          if (authState.error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    color: Theme.of(context).colorScheme.error,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      authState.error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
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
                  activeColor: const Color(0xFF667eea),
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
                        userAgreementContent,
                      ),
                      child: Text(
                        loc.registerUserAgreement,
                        style: const TextStyle(
                          color: Color(0xFF667eea),
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
                        privacyPolicyContent,
                      ),
                      child: Text(
                        loc.registerPrivacyPolicy,
                        style: const TextStyle(
                          color: Color(0xFF667eea),
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

  void _register() {
    final loc = AppLocalizations.of(context)!;

    if (!_agreementAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.registerAgreementRequired)),
      );
      return;
    }

    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authStateProvider.notifier).register(
            _usernameController.text.trim(),
            _emailController.text.trim(),
            _passwordController.text,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
