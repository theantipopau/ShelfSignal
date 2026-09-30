import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import '../providers.dart';

/// Active Signals — the home priority per spec section 10.
class SignalsScreen extends ConsumerWidget {
  const SignalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signalsAsync = ref.watch(signalsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Active Signals')),
      body: signalsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(message: '$e'),
        data: (signals) {
          if (signals.isEmpty) {
            return _EmptySignalsView(onScan: () => context.go('/scan'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(signalsProvider.notifier).refresh(),
            child: ListView.builder(
              itemCount: signals.length,
              itemBuilder: (context, index) =>
                  SignalCard(signal: signals[index]),
            ),
          );
        },
      ),
    );
  }
}

class SignalCard extends ConsumerWidget {
  const SignalCard({super.key, required this.signal});

  final Signal signal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accent = SsColors.forLabel(signal.label);
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SsSpacing.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    signal.label,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const Spacer(),
                Semantics(
                  label: 'Last checked ${signal.checkedAgo}',
                  child: Text(
                    'Checked ${signal.checkedAgo}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: SsSpacing.s),
            Text(
              'Strong signal at ${signal.retailerName}'
                  .replaceFirst('Strong signal', signal.label),
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${signal.product.brand} ${signal.product.name}'
              ' ${signal.product.identitySuffix}',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: SsSpacing.s),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  signal.currentPrice.asAud,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: accent,
                  ),
                ),
                if (signal.baselinePrice != null) ...[
                  const SizedBox(width: SsSpacing.s),
                  Text(
                    'observed usual ${signal.baselinePrice!.asAud}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: SsSpacing.s),
            Text(signal.explanation, style: theme.textTheme.bodyMedium),
            const SizedBox(height: SsSpacing.m),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: () =>
                      ref.read(signalsProvider.notifier).markBought(signal.id),
                  icon: const Icon(Icons.check_circle_outline, size: 18),
                  label: const Text('Mark as bought'),
                ),
                const SizedBox(width: SsSpacing.s),
                TextButton(
                  onPressed: () =>
                      ref.read(signalsProvider.notifier).dismiss(signal.id),
                  child: const Text('Dismiss'),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () =>
                      context.go('/product/${signal.product.id}'),
                  child: const Text('Details'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptySignalsView extends StatelessWidget {
  const _EmptySignalsView({required this.onScan});

  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SsSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.waves, size: 56, color: theme.colorScheme.primary),
            const SizedBox(height: SsSpacing.m),
            Text(
              'No active signals',
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: SsSpacing.s),
            Text(
              'Scan the products you already buy and set a target. '
              'ShelfSignal watches the price for you.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SsSpacing.l),
            FilledButton.icon(
              onPressed: onScan,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan a product'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SsSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: SsSpacing.m),
            Text('Could not load signals',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: SsSpacing.s),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
