import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/demo_backend.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../providers.dart';

/// Product detail: exact identity, verification status and watch action.
/// (Price history chart arrives with Phase 3 — retailer adapters.)
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  SsProduct? _product;
  bool _loading = true;
  bool _watching = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = ref.read(repositoryProvider);
      // Demo mode: resolve from fixtures. Live mode: search by id is not
      // exposed yet, so the scan/search path carries the product.
      SsProduct? product;
      if (repo.isDemo) {
        final matches = DemoBackend.instance.products
            .where((p) => p.id == widget.productId)
            .toList();
        if (matches.isNotEmpty) product = matches.first;
      }
      if (!mounted) return;
      setState(() {
        _product = product;
        _loading = false;
        if (product == null) {
          _error = 'Product details are only available for scanned items '
              'in this build.';
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = '$e';
        });
      }
    }
  }

  Future<void> _watch() async {
    final product = _product;
    if (product == null) return;
    setState(() => _watching = true);
    await ref.read(watchlistProvider.notifier).watch(product);
    if (mounted) setState(() => _watching = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final product = _product;

    return Scaffold(
      appBar: AppBar(title: const Text('Product')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null || product == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(SsSpacing.l),
                    child: Text(_error ?? 'Not found',
                        textAlign: TextAlign.center),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(SsSpacing.m),
                  children: [
                    Text(
                      '${product.brand} ${product.name}',
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    if (product.identitySuffix.isNotEmpty)
                      Text(product.identitySuffix,
                          style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: SsSpacing.s),
                    Row(
                      children: [
                        Icon(
                          product.isVerified
                              ? Icons.verified
                              : Icons.help_outline,
                          size: 18,
                          color: product.isVerified
                              ? theme.colorScheme.primary
                              : SsColors.signalAmber,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          product.isVerified
                              ? 'Verified match'
                              : 'Unverified — pending review',
                          style: theme.textTheme.labelLarge,
                        ),
                      ],
                    ),
                    const SizedBox(height: SsSpacing.l),
                    if (product.barcode != null)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.qr_code_2),
                          title: Text(product.barcode!),
                          subtitle: const Text('GTIN barcode'),
                        ),
                      ),
                    const SizedBox(height: SsSpacing.l),
                    FilledButton.icon(
                      onPressed: _watching ? null : _watch,
                      icon: const Icon(Icons.visibility),
                      label: const Text('Add to My Watchlist'),
                    ),
                  ],
                ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {}

