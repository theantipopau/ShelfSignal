import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../providers.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = await ref.read(sessionProvider.notifier).register(
          _email.text.trim(),
          _password.text,
          _name.text.trim().isEmpty ? null : _name.text.trim(),
        );
    if (ok && mounted) context.go('/signals');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: ListView(
        padding: const EdgeInsets.all(SsSpacing.l),
        children: [
          if (session.error != null) ...[
            Text(
              session.error!,
              style:
                  theme.textTheme.bodySmall?.copyWith(color: SsColors.errorRed),
            ),
            const SizedBox(height: SsSpacing.s),
          ],
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Display name'),
          ),
          const SizedBox(height: SsSpacing.m),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: SsSpacing.m),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Password',
              helperText: 'At least 8 characters',
            ),
          ),
          const SizedBox(height: SsSpacing.l),
          FilledButton(
            onPressed: session.isLoading ? null : _submit,
            child: const Text('Create account'),
          ),
        ],
      ),
    );
  }
}
