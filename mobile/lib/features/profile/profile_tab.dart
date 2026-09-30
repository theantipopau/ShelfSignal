import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(SsSpacing.m),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(
                child: Text(session.email?.substring(0, 1).toUpperCase() ?? '?'),
              ),
              title: Text(session.email ?? 'Not signed in'),
              subtitle: const Text('Demo mode — data stays on this device'),
            ),
          ),
          const SizedBox(height: SsSpacing.m),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.tune),
                  title: const Text('Notification preferences'),
                  subtitle: const Text('Quiet hours, digests, cooldowns'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            'Notification preferences arrive with the push pipeline.'),
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.local_bar_outlined),
                  title: const Text('Alcohol categories'),
                  subtitle: const Text('Adult confirmation required'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Age confirmation flow arrives with the store builds.'),
                      ),
                    );
                  },
                ),
                SwitchListTile(
                  secondary: const Icon(Icons.science_outlined),
                  title: const Text('Demo mode'),
                  subtitle: const Text('Use fixtures instead of the API'),
                  value: ref.watch(demoModeProvider),
                  onChanged: (v) =>
                      ref.read(demoModeProvider.notifier).state = v,
                ),
              ],
            ),
          ),
          const SizedBox(height: SsSpacing.m),
          Card(
            child: ListTile(
              leading: const Icon(Icons.delete_outline, color: SsColors.errorRed),
              title: const Text('Delete account',
                  style: TextStyle(color: SsColors.errorRed)),
              subtitle: const Text('Removes your data. Demo mode clears locally.'),
              onTap: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Delete account?'),
                    content: const Text(
                        'This removes your watchlist, rules and signals. '
                        'This cannot be undone.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Delete'),
                      ),
                    ],
                  ),
                );
                if (confirmed == true && context.mounted) {
                  await ref.read(sessionProvider.notifier).signOut();
                  if (context.mounted) context.go('/sign-in');
                }
              },
            ),
          ),
          const SizedBox(height: SsSpacing.l),
          if (session.isSignedIn)
            Center(
              child: TextButton(
                onPressed: () async {
                  await ref.read(sessionProvider.notifier).signOut();
                  if (context.mounted) context.go('/sign-in');
                },
                child: const Text('Sign out'),
              ),
            ),
        ],
      ),
    );
  }
}
