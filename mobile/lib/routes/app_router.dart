import 'package:go_router/go_router.dart';

import '../features/auth/sign_in_screen.dart';
import '../features/auth/sign_up_screen.dart';
import '../features/home/home_shell.dart';
import '../features/home/signals_tab.dart';
import '../features/products/product_detail_screen.dart';
import '../features/profile/profile_tab.dart';
import '../features/scanner/scanner_screen.dart';
import '../features/watchlist/screens/rule_editor_screen.dart';
import '../features/watchlist/screens/watchlist_tab.dart';

final appRouter = GoRouter(
  initialLocation: '/signals',
  routes: [
    GoRoute(
      path: '/sign-in',
      builder: (context, state) => const SignInScreen(),
    ),
    GoRoute(
      path: '/sign-up',
      builder: (context, state) => const SignUpScreen(),
    ),
    ShellRoute(
      builder: (context, state, child) => HomeShell(child: child),
      routes: [
        GoRoute(
          path: '/signals',
          builder: (context, state) => const SignalsScreen(),
        ),
        GoRoute(
          path: '/watchlist',
          builder: (context, state) => const WatchlistScreen(),
        ),
        GoRoute(
          path: '/scan',
          builder: (context, state) => const ScannerScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfileScreen(),
        ),
      ],
    ),
    GoRoute(
      path: '/product/:id',
      builder: (context, state) => ProductDetailScreen(
        productId: state.pathParameters['id']!,
      ),
    ),
    GoRoute(
      path: '/watchlist/:id/rule',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return RuleEditorScreen(
          watchItemId: state.pathParameters['id']!,
          productName: extra?['name'] as String? ?? 'Watched product',
          initialRuleType: extra?['ruleType'] as String?,
          initialTarget: extra?['target'] as double?,
        );
      },
    ),
  ],
);
