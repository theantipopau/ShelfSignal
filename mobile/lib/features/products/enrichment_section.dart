import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';

/// Photo, identity and community prices for one barcode, from free public
/// sources (Open Food Facts, Open Prices) via the backend enrichment endpoint.
class EnrichmentSection extends ConsumerStatefulWidget {
  const EnrichmentSection({super.key, required this.barcode, this.showIdentity = false});

  final String barcode;

  /// Show the Open Food Facts name and brand (used when the barcode is not in our catalogue).
  final bool showIdentity;

  @override
  ConsumerState<EnrichmentSection> createState() => _EnrichmentSectionState();
}

class _EnrichmentSectionState extends ConsumerState<EnrichmentSection> {
  late Future<ProductEnrichment?> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void didUpdateWidget(EnrichmentSection old) {
    super.didUpdateWidget(old);
    if (old.barcode != widget.barcode) _future = _load();
  }

  Future<ProductEnrichment?> _load() =>
      ref.read(repositoryProvider).enrichBarcode(widget.barcode);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
    );

    return FutureBuilder<ProductEnrichment?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: SsSpacing.s),
            child: LinearProgressIndicator(),
          );
        }
        if (snap.hasError) {
          return Text('Could not load photo or community prices.', style: muted);
        }
        final data = snap.data;
        if (data == null) {
          return Text(
            'Photos and community prices are available in live mode.',
            style: muted,
          );
        }
        final identity = data.identity;
        final prices = data.communityPrices;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (identity?.imageUrl != null) ...[
              const SizedBox(height: SsSpacing.s),
              Center(
                child: Image.network(
                  identity!.imageUrl!,
                  height: 160,
                  fit: BoxFit.contain,
                  semanticLabel: 'Product photo',
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ],
            if (widget.showIdentity && identity != null) ...[
              const SizedBox(height: SsSpacing.s),
              Text(identity.name, style: theme.textTheme.titleMedium),
              if (identity.brand.isNotEmpty) Text(identity.brand, style: muted),
              Text('Identity from Open Food Facts · unverified', style: muted),
            ],
            const SizedBox(height: SsSpacing.m),
            Text('Community prices', style: theme.textTheme.labelLarge),
            const SizedBox(height: SsSpacing.xs),
            if (prices == null)
              Text('Open Prices is unreachable right now.', style: muted)
            else if (prices.isEmpty)
              Text('No community prices for this barcode yet.', style: muted)
            else
              for (final p in prices.take(5))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                    '${p.price.asAud} · ${p.store}'
                    '${p.city != null ? ', ${p.city}' : ''}'
                    '${p.date != null ? ' · ${p.date}' : ''}',
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
            const SizedBox(height: SsSpacing.xs),
            Text(
              'Shopper-submitted, not monitored by ShelfSignal.',
              style: muted,
            ),
          ],
        );
      },
    );
  }
}
