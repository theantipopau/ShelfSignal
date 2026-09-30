import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models.dart';
import '../../../core/theme.dart';
import '../../providers.dart';

/// My Watchlist — watched products with rule + price state (spec section 9.5).
class WatchlistScreen extends ConsumerWidget {
  const WatchlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final watchAsync = ref.watch(watchlistProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Watchlist')),
      body: watchAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SsSpacing.xl),
            child: Text('Could not load watchlist:\n$e',
                textAlign: TextAlign.center),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return _EmptyWatchlist(onScan: () => context.go('/scan'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(watchlistProvider.notifier).refresh(),
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) =>
                  WatchItemCard(item: items[index]),
            ),
          );
        },
      ),
    );
  }
}

class WatchItemCard extends ConsumerWidget {
  const WatchItemCard({super.key, required this.item});

  final WatchItem item;

  String get _ruleLabel {
    switch (item.ruleType) {
      case 'target_price':
        return 'Target ${item.targetPrice?.asAud ?? '-'}';
      case 'discount_percent':
        return '≥${item.minDiscountPercent?.toStringAsFixed(0) ?? '-'}% off usual';
      case 'near_historical_low':
        return 'Near historical low';
      case 'any_price_drop':
        return 'Any price drop';
      default:
        return 'No signal rule yet';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final hasSignals = item.activeSignalCount > 0;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.go('/product/${item.product.id}'),
        child: Padding(
          padding: const EdgeInsets.all(SsSpacing.m),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${item.product.brand} ${item.product.name}',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (hasSignals)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: SsColors.signalGreen.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${item.activeSignalCount} signal${item.activeSignalCount == 1 ? '' : 's'}',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: SsColors.signalGreen),
                      ),
                    ),
                ],
              ),
              if (item.product.identitySuffix.isNotEmpty)
                Text(item.product.identitySuffix,
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: SsSpacing.s),
              Row(
                children: [
                  if (item.currentPrice != null)
                    Text(
                      item.currentPrice!.asAud,
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    )
                  else
                    Text('No current offer',
                        style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant)),
                  const Spacer(),
                  Text(
                    _ruleLabel,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: item.ruleType == null
                          ? SsColors.signalAmber
                          : theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
              if (item.lastCheckedAt != null) ...[
                const SizedBox(height: 2),
                Text('Last checked ${_ago(item.lastCheckedAt!)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant)),
              ],
              const SizedBox(height: SsSpacing.s),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () => context.go(
                      '/watchlist/${item.id}/rule',
                      extra: {
                        'name':
                            '${item.product.brand} ${item.product.name}',
                        'ruleType': item.ruleType,
                        'target': item.targetPrice,
                      },
                    ),
                    icon: const Icon(Icons.tune, size: 18),
                    label: Text(item.ruleType == null
                        ? 'Set signal rule'
                        : 'Change rule'),
                  ),
                  TextButton.icon(
                    onPressed: () =>
                        ref.read(watchlistProvider.notifier).snooze(item.id),
                    icon: const Icon(Icons.snooze, size: 18),
                    label: const Text('Snooze'),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Remove from watchlist',
                    onPressed: () =>
                        ref.read(watchlistProvider.notifier).remove(item.id),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) return '${d.inHours} h ago';
    return '${d.inDays} d ago';
  }
}

class _EmptyWatchlist extends StatelessWidget {
  const _EmptyWatchlist({required this.onScan});

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
            Icon(Icons.inventory_2_outlined,
                size: 56, color: theme.colorScheme.primary),
            const SizedBox(height: SsSpacing.m),
            Text('Nothing watched yet', style: theme.textTheme.titleLarge),
            const SizedBox(height: SsSpacing.s),
            Text(
              'Scan what you buy. ShelfSignal keeps an exact watch on the '
              'products your household actually uses.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SsSpacing.l),
            FilledButton.icon(
              onPressed: onScan,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Start scanning'),
            ),
          ],
        ),
      ),
    );
  }
}
