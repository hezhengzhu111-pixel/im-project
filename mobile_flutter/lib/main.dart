import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'services/http_client.dart';
import 'services/storage_service.dart';
import 'state/auth_controller.dart';
import 'state/chat_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storage = await StorageService.create();
  final httpClient = HttpClient(storage: storage);
  final authController = AuthController(storage: storage, httpClient: httpClient);
  await authController.bootstrap();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthController>.value(value: authController),
        ChangeNotifierProvider<ChatController>(
          create: (_) => ChatController(httpClient: httpClient, authController: authController),
        ),
      ],
      child: const ImMobileApp(),
    ),
  );
}
