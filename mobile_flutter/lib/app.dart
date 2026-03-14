import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'state/auth_controller.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/login_screen.dart';

class ImMobileApp extends StatelessWidget {
  const ImMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'IM Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: Consumer<AuthController>(
        builder: (_, auth, __) {
          if (auth.bootstrapping) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return auth.isLoggedIn ? const HomeScreen() : const LoginScreen();
        },
      ),
    );
  }
}
