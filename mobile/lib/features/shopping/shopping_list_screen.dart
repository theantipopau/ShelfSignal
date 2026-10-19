import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../common/live_only_notice.dart';

/// Shopping list (spec 9.10). Open items only; completed items drop off the list.
/// Items shared with the household can be ticked off by any member.
class ShoppingListScreen extends ConsumerStatefulWidget {
  const ShoppingListScreen({super.key});

  @override
  ConsumerState<ShoppingListScreen> createState() => _ShoppingListScreenState();
}

class _ShoppingListScreenState extends ConsumerState<ShoppingListScreen> {
  final _titleController = TextEditingController();
  List<ShoppingItem>? _items;
  bool _shared = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!ref.read(repositoryProvider).isDemo) _reload();
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Repository get _repo => ref.read(repositoryProvider);

  Future<void> _reload() async {
    try {
      final items = await _repo.listShoppingItems();
      if (mounted) setState(() => _items = items);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  /// Runs a write, then refreshes. Failures (e.g. a non-owner deleting) surface as a snackbar.
  Future<void> _write(Future<void> Function() action) async {
    try {
      await action();
      await _reload();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _add() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;
    _titleController.clear();
    await _write(() => _repo.addShoppingItem(title, shared: _shared));
  }

  @override
  Widget build(BuildContext context) {
    if (ref.watch(repositoryProvider).isDemo) {
      return const LiveOnlyNotice(title: 'Shopping list');
    }
    final theme = Theme.of(context);
    final items = _items;

    return Scaffold(
      appBar: AppBar(title: const Text('Shopping list')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(SsSpacing.m),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _titleController,
                        textInputAction: TextInputAction.done,
                        decoration: const InputDecoration(labelText: 'Add an item'),
                        onSubmitted: (_) => _add(),
                      ),
                    ),
                    const SizedBox(width: SsSpacing.s),
                    IconButton.filled(
                      tooltip: 'Add to list',
                      icon: const Icon(Icons.add),
                      onPressed: _add,
                    ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Share with household'),
                  subtitle: const Text('Members can see and tick off shared items'),
                  value: _shared,
                  onChanged: (v) => setState(() => _shared = v),
                ),
              ],
            ),
          ),
          Expanded(
            child: _error != null
                ? Center(child: Text(_error!))
                : items == null
                    ? const Center(child: CircularProgressIndicator())
                    : items.isEmpty
                        ? Center(
                            child: Text('Nothing on the list yet.',
                                style: theme.textTheme.bodyMedium),
                          )
                        : ListView(
                            children: [
                              for (final item in items)
                                ListTile(
                                  leading: Checkbox(
                                    value: item.isDone,
                                    onChanged: (v) => _write(
                                        () => _repo.setShoppingItemDone(item.id, v ?? false)),
                                  ),
                                  title: Text(item.title),
                                  subtitle: Text(
                                    [
                                      if (item.quantity > 1) '× ${item.quantity}',
                                      if (item.shared) 'Shared with household',
                                    ].join(' · '),
                                  ),
                                  trailing: IconButton(
                                    tooltip: 'Delete',
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () => _write(() => _repo.deleteShoppingItem(item.id)),
                                  ),
                                ),
                            ],
                          ),
          ),
        ],
      ),
    );
  }
}
