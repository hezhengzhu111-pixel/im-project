import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/ui.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';



class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _rememberMe = false;
  bool _obscurePassword = true;

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
    _animController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = context.isMobile;

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
              child: isMobile ? _buildMobileLayout() : _buildDesktopLayout(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMobileLayout() {
    return Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(ImTokens.space6),
        child: _buildLoginCard(),
      ),
    );
  }

  Widget _buildDesktopLayout() {
    return Row(
      children: [
        const Expanded(child: BrandShowcase()),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(ImTokens.space6),
              child: _buildLoginCard(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLoginCard() {
    return ImCard(
      elevated: true,
      padding: EdgeInsets.all(ImTokens.space8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '登录',
              style: TextStyle(
                fontSize: ImTokens.text2xl,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: ImTokens.space2),
            Text(
              '欢迎回来，请登录您的账号',
              style: TextStyle(
                fontSize: ImTokens.textBase,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            SizedBox(height: ImTokens.space6),
            _buildForm(),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    final authState = ref.watch(authStateProvider);
    final loc = AppLocalizations.of(context)!;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildTextField(
            controller: _usernameController,
            label: loc.loginUsername,
            hintText: '请输入用户名',
            prefix: const Icon(Icons.person_outline),
            validator: (v) => Validators.validateUsername(v, loc),
          ),
          SizedBox(height: ImTokens.space4),
          _buildTextField(
            controller: _passwordController,
            label: loc.loginPassword,
            hintText: '请输入密码',
            obscure: _obscurePassword,
            prefix: const Icon(Icons.lock_outline),
            suffix: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off : Icons.visibility,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            validator: (v) => Validators.validatePassword(v, loc),
          ),
          if (authState.error != null) ...[
            SizedBox(height: ImTokens.space3),
            Container(
              padding: EdgeInsets.all(ImTokens.space3),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(ImTokens.radiusMd),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    color: Theme.of(context).colorScheme.error,
                    size: 20,
                  ),
                  SizedBox(width: ImTokens.space2),
                  Expanded(
                    child: Text(
                      authState.error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontSize: ImTokens.textSm,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
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
          ImButton(
            label: loc.loginButton,
            fullWidth: true,
            loading: authState.isLoading,
            onPressed: _login,
          ),
          SizedBox(height: ImTokens.space4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(loc.loginNoAccountRegister.contains('注册')
                  ? '还没有账号？'
                  : loc.loginNoAccountRegister),
              ImButton(
                variant: ImButtonVariant.text,
                label: loc.loginNoAccountRegister.contains('注册')
                    ? '立即注册'
                    : loc.loginNoAccountRegister,
                onPressed: () => context.go('/register'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    String? hintText,
    bool obscure = false,
    Widget? prefix,
    Widget? suffix,
    String? Function(String?)? validator,
  }) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: ImTokens.textSm,
            fontWeight: FontWeight.w500,
            color: colors.textPrimary,
          ),
        ),
        SizedBox(height: ImTokens.space1),
        TextFormField(
          controller: controller,
          obscureText: obscure,
          validator: validator,
          decoration: InputDecoration(
            hintText: hintText,
            prefixIcon: prefix,
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    await ref.read(authStateProvider.notifier).login(
          _usernameController.text.trim(),
          _passwordController.text,
          rememberMe: _rememberMe,
        );
  }
}
