import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'routes/app_router.dart';

void main() {
  runApp(const ProviderScope(child: ShelfSignalApp()));
}

class ShelfSignalApp extends ConsumerWidget {
  const ShelfSignalApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'ShelfSignal',
      debugShowCheckedModeBanner: false,
      theme: buildSsTheme(Brightness.light),
      darkTheme: buildSsTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}
