import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/auth/presentation/widgets/form_field.dart';

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

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF667eea), Color(0xFF764ba2)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: Center(
              child: AuthCard(
                title: '登录',
                subtitle: '请登录您的加密通信账户',
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AuthFormField(
                        controller: _usernameController,
                        label: '用户名',
                        icon: Icons.person,
                        validator: Validators.validateUsername,
                      ),
                      const SizedBox(height: 16),
                      AuthFormField(
                        controller: _passwordController,
                        label: '密码',
                        icon: Icons.lock,
                        obscureText: true,
                        validator: Validators.validatePassword,
                      ),
                      if (authState.error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          authState.error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Checkbox(
                            value: _rememberMe,
                            onChanged: (value) {
                              setState(() {
                                _rememberMe = value ?? false;
                              });
                            },
                          ),
                          const Text('记住我'),
                        ],
                      ),
                      const SizedBox(height: 24),
                      GradientButton(
                        text: '登录',
                        isLoading: authState.isLoading,
                        onPressed: _login,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => context.go('/register'),
                        child: const Text('没有账号？注册'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _login() {
    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authStateProvider.notifier).login(
            _usernameController.text.trim(),
            _passwordController.text,
            rememberMe: _rememberMe,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _controller.dispose();
    super.dispose();
  }
}
