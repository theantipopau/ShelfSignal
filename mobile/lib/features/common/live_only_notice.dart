import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Shown in place of a live-only screen while the app runs in demo mode.
class LiveOnlyNotice extends StatelessWidget {
  const LiveOnlyNotice({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(SsSpacing.l),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_outlined, size: 40, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: SsSpacing.m),
              Text(
                'This needs a live account. Turn off Demo mode in Profile and sign in.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
