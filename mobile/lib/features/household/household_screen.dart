import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../common/live_only_notice.dart';
import '../providers.dart';

/// Household (spec 9.9): create one, invite people with a one-time code, share
/// watch items and the shopping list. Members are matched to the signed-in
/// user by email, which is what the server returns for each member.
class HouseholdScreen extends ConsumerStatefulWidget {
  const HouseholdScreen({super.key});

  @override
  ConsumerState<HouseholdScreen> createState() => _HouseholdScreenState();
}

class _HouseholdScreenState extends ConsumerState<HouseholdScreen> {
  final _nameController = TextEditingController();
  final _joinController = TextEditingController();
  final _inviteEmailController = TextEditingController();
  Household? _household;
  bool _loaded = false;
  String? _inviteToken;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!ref.read(repositoryProvider).isDemo) _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _joinController.dispose();
    _inviteEmailController.dispose();
    super.dispose();
  }

  Repository get _repo => ref.read(repositoryProvider);

  Future<void> _load() async {
    try {
      final list = await _repo.listHouseholds();
      final detail = list.isEmpty ? null : await _repo.getHousehold(list.first.id);
      if (mounted) setState(() => _household = detail);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loaded = true);
    }
  }

  void _show(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Runs a write, then refreshes. Server rejections (cap reached, not owner…) show as messages.
  Future<void> _write(Future<void> Function() action) async {
    try {
      await action();
      await _load();
    } on ApiException catch (e) {
      _show(e.message);
    }
  }

  Future<void> _create() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    await _write(() => _repo.createHousehold(name));
  }

  Future<void> _join() async {
    final token = _joinController.text.trim();
    if (token.isEmpty) return;
    _joinController.clear();
    await _write(() => _repo.acceptInvite(token));
  }

  Future<void> _invite(String householdId) async {
    final email = _inviteEmailController.text.trim();
    _inviteEmailController.clear();
    try {
      final token = await _repo.createInvite(householdId, email: email);
      if (mounted) setState(() => _inviteToken = token);
      await _load();
    } on ApiException catch (e) {
      _show(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (ref.watch(repositoryProvider).isDemo) {
      return const LiveOnlyNotice(title: 'Household');
    }
    final session = ref.watch(sessionProvider);
    final theme = Theme.of(context);
    final h = _household;
    final me = h?.members.where((m) => m.email == session.email).firstOrNull;

    return Scaffold(
      appBar: AppBar(title: Text(h?.name ?? 'Household')),
      body: _error != null
          ? Center(child: Text(_error!))
          : !_loaded
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(SsSpacing.m),
                  children: h == null
                      ? [
                          Text('Share your list and watchlist with one other person or a whole house.',
                              style: theme.textTheme.bodyMedium),
                          const SizedBox(height: SsSpacing.m),
                          TextField(
                            controller: _nameController,
                            decoration: const InputDecoration(labelText: 'Household name'),
                          ),
                          const SizedBox(height: SsSpacing.s),
                          FilledButton(onPressed: _create, child: const Text('Create household')),
                          const Divider(height: SsSpacing.xl),
                          Text('Have an invite code?', style: theme.textTheme.titleSmall),
                          const SizedBox(height: SsSpacing.s),
                          TextField(
                            controller: _joinController,
                            decoration: const InputDecoration(labelText: 'Invite code'),
                          ),
                          const SizedBox(height: SsSpacing.s),
                          OutlinedButton(onPressed: _join, child: const Text('Join')),
                        ]
                      : [
                          Text('${h.members.length} member${h.members.length == 1 ? '' : 's'} · you are ${h.role}',
                              style: theme.textTheme.bodySmall),
                          const SizedBox(height: SsSpacing.m),
                          Text('Members', style: theme.textTheme.titleSmall),
                          for (final m in h.members)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(child: Text(m.email.isEmpty ? '?' : m.email[0].toUpperCase())),
                              title: Text(m.displayName ?? m.email),
                              subtitle: Text(m.role == 'owner' ? 'Owner' : 'Member'),
                              trailing: (m == me && !h.isOwner) || (h.isOwner && m.role != 'owner')
                                  ? TextButton(
                                      onPressed: () => _write(
                                          () => _repo.removeMember(h.id, m.userId)),
                                      child: Text(m == me ? 'Leave' : 'Remove'),
                                    )
                                  : null,
                            ),
                          if (h.isOwner) ...[
                            const Divider(height: SsSpacing.xl),
                            Text('Invite someone', style: theme.textTheme.titleSmall),
                            const SizedBox(height: SsSpacing.xs),
                            Text('Codes expire and are shown once. Email is optional.',
                                style: theme.textTheme.bodySmall),
                            const SizedBox(height: SsSpacing.s),
                            TextField(
                              controller: _inviteEmailController,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(labelText: 'Their email (optional)'),
                            ),
                            const SizedBox(height: SsSpacing.s),
                            FilledButton(
                              onPressed: () => _invite(h.id),
                              child: const Text('Create invite code'),
                            ),
                            if (_inviteToken != null) ...[
                              const SizedBox(height: SsSpacing.s),
                              Card(
                                child: ListTile(
                                  title: SelectableText(_inviteToken!),
                                  subtitle: const Text('Copy it now. It will not be shown again.'),
                                  trailing: IconButton(
                                    tooltip: 'Copy code',
                                    icon: const Icon(Icons.copy),
                                    onPressed: () async {
                                      await Clipboard.setData(ClipboardData(text: _inviteToken!));
                                      _show('Invite code copied');
                                    },
                                  ),
                                ),
                              ),
                            ],
                            for (final inv in h.invites)
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(inv.inviteeEmail ?? 'Open invite'),
                                subtitle: Text('Expires ${inv.expiresAt.toLocal().toString().split('.').first}'),
                                trailing: TextButton(
                                  onPressed: () => _write(() => _repo.revokeInvite(h.id, inv.id)),
                                  child: const Text('Revoke'),
                                ),
                              ),
                          ],
                        ],
                ),
    );
  }
}
