import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../providers.dart';

/// Signal rule editor (spec section 9.6): recommend, explain, allow edits.
class RuleEditorScreen extends ConsumerStatefulWidget {
  const RuleEditorScreen({
    super.key,
    required this.watchItemId,
    required this.productName,
    this.initialRuleType,
    this.initialTarget,
  });

  final String watchItemId;
  final String productName;
  final String? initialRuleType;
  final double? initialTarget;

  @override
  ConsumerState<RuleEditorScreen> createState() => _RuleEditorScreenState();
}

class _RuleEditorScreenState extends ConsumerState<RuleEditorScreen> {
  late String _ruleType;
  late TextEditingController _targetCtrl;
  late TextEditingController _discountCtrl;

  static const _types = <String, String>{
    'target_price': 'Target price',
    'discount_percent': 'Discount off observed usual price',
    'near_historical_low': 'Near historical low',
    'any_price_drop': 'Any price drop',
  };

  @override
  void initState() {
    super.initState();
    _ruleType = widget.initialRuleType ?? 'target_price';
    _targetCtrl = TextEditingController(
      text: widget.initialTarget?.toStringAsFixed(2) ?? '',
    );
    _discountCtrl = TextEditingController(text: '20');
  }

  @override
  void dispose() {
    _targetCtrl.dispose();
    _discountCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    double? target;
    double? discount;
    if (_ruleType == 'target_price') {
      target = double.tryParse(_targetCtrl.text.replaceAll(r'$', ''));
      if (target == null || target <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter a valid target price')),
        );
        return;
      }
    }
    if (_ruleType == 'discount_percent') {
      discount = double.tryParse(_discountCtrl.text);
      if (discount == null || discount <= 0 || discount > 90) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Discount must be between 1 and 90')),
        );
        return;
      }
    }

    await ref.read(watchlistProvider.notifier).setRule(
          watchItemId: widget.watchItemId,
          ruleType: _ruleType,
          targetPrice: target,
          minDiscountPercent: discount,
        );
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Signal rule')),
      body: ListView(
        padding: const EdgeInsets.all(SsSpacing.m),
        children: [
          Text(widget.productName, style: theme.textTheme.titleMedium),
          const SizedBox(height: SsSpacing.s),
          Text(
            'Choose what makes this product worth buying again. '
            'You can change this any time.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: SsSpacing.l),
          for (final entry in _types.entries)
            ListTile(
              leading: Icon(
                _ruleType == entry.key
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
                color: _ruleType == entry.key
                    ? Theme.of(context).colorScheme.primary
                    : null,
              ),
              title: Text(entry.value),
              onTap: () => setState(() => _ruleType = entry.key),
            ),
          const SizedBox(height: SsSpacing.m),
          if (_ruleType == 'target_price') ...[
            TextField(
              controller: _targetCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Target price',
                prefixText: r'$',
                helperText:
                    'We signal when the price reaches or beats this.',
              ),
            ),
          ],
          if (_ruleType == 'discount_percent') ...[
            TextField(
              controller: _discountCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Minimum discount (%)',
                helperText:
                    'Compared with the observed usual price, not the sticker.',
              ),
            ),
          ],
          if (_ruleType == 'near_historical_low') ...[
            const _Note(
              text: 'Signals when the price is within 5% of the lowest '
                  'price we have observed.',
            ),
          ],
          if (_ruleType == 'any_price_drop') ...[
            const _Note(
              text: 'Signals on any genuine drop below the observed usual '
                  'price. Cooldowns keep notifications calm.',
            ),
          ],
          const SizedBox(height: SsSpacing.l),
          FilledButton(
            onPressed: _save,
            child: const Text('Save rule'),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(SsSpacing.m),
      decoration: BoxDecoration(
        color: SsColors.signalAmber.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: theme.textTheme.bodySmall),
    );
  }
}
