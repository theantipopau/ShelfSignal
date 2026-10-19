import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../common/live_only_notice.dart';

/// Personal data export (spec 17). Shows what is held, per section, and copies
/// the full JSON to the clipboard. Nothing is uploaded anywhere else.
class DataExportScreen extends ConsumerStatefulWidget {
  const DataExportScreen({super.key});

  @override
  ConsumerState<DataExportScreen> createState() => _DataExportScreenState();
}

// Sections the export reports on, in the order they appear in the file.
const _sections = {
  'watch_items': 'Watchlist items',
  'signal_rules': 'Signal rules',
  'signals': 'Signals',
  'scan_history': 'Scan history',
  'shopping_list': 'Shopping list items',
  'devices': 'Registered devices',
  'reports': 'Mismatch reports',
};

class _DataExportScreenState extends ConsumerState<DataExportScreen> {
  Map<String, dynamic>? _export;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!ref.read(repositoryProvider).isDemo) _load();
  }

  Future<void> _load() async {
    try {
      final data = await ref.read(repositoryProvider).exportData();
      if (mounted) setState(() => _export = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (ref.watch(repositoryProvider).isDemo) {
      return const LiveOnlyNotice(title: 'Your data');
    }
    final theme = Theme.of(context);
    final data = _export;

    return Scaffold(
      appBar: AppBar(title: const Text('Your data')),
      body: _error != null
          ? Center(child: Padding(padding: const EdgeInsets.all(SsSpacing.l), child: Text(_error!)))
          : data == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(SsSpacing.m),
                  children: [
                    Text(
                      'Everything ShelfSignal holds about your account, as of this export. '
                      'Deleting your account removes all of it.',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: SsSpacing.m),
                    for (final entry in _sections.entries)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(entry.value),
                        trailing: Text('${_count(data[entry.key])}'),
                      ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Notification preferences'),
                      trailing: Text(data['notification_preferences'] == null ? 'defaults' : 'saved'),
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Household'),
                      trailing: Text(data['household'] == null ? 'none' : 'member'),
                    ),
                    const SizedBox(height: SsSpacing.m),
                    FilledButton.icon(
                      icon: const Icon(Icons.copy),
                      label: const Text('Copy full export (JSON)'),
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(
                          text: const JsonEncoder.withIndent('  ').convert(data),
                        ));
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Export copied to the clipboard')),
                          );
                        }
                      },
                    ),
                  ],
                ),
    );
  }

  int _count(Object? v) => v is List ? v.length : 0;
}
