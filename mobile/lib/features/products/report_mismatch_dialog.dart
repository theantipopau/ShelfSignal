import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/repository.dart';

const _kinds = {
  'mismatch': 'The photo or name is wrong for this barcode',
  'wrong_details': 'Size, brand or variant is wrong',
  'other': 'Something else',
};

/// "Report mismatch" (spec 9.8). Sends a moderation report; the server dedupes
/// repeat reports from the same user for the same product and kind.
Future<void> showReportMismatchDialog(BuildContext context, WidgetRef ref, String productId) async {
  final messenger = ScaffoldMessenger.of(context);
  final note = TextEditingController();
  var kind = 'mismatch';

  final sent = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Report a mismatch'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RadioGroup<String>(
              groupValue: kind,
              onChanged: (v) => setState(() => kind = v!),
              child: Column(
                children: [
                  for (final entry in _kinds.entries)
                    RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      title: Text(entry.value),
                      value: entry.key,
                    ),
                ],
              ),
            ),
            TextField(
              controller: note,
              maxLength: 500,
              decoration: const InputDecoration(labelText: 'Details (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send')),
        ],
      ),
    ),
  );
  final text = note.text.trim();
  note.dispose();
  if (sent != true) return;

  try {
    await ref.read(repositoryProvider).reportProduct(productId, kind: kind, note: text);
    messenger.showSnackBar(const SnackBar(content: Text('Thanks — we will review it.')));
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}
