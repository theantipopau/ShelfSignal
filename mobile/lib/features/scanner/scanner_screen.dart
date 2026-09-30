import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../providers.dart';

/// Scan tab. Camera capture is deferred (see backlog: camera permission
/// timing per spec 9.2); manual GTIN entry is the accessible fallback and
/// always available. In demo mode, fixture barcodes are listed for reuse.
class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  BarcodeResolution? _result;

  static const _demoBarcodes = <String, String>{
    '9310640020223': 'ExampleBrand Tomato Pasta Sauce 500mL',
    '9300675046257': 'ExampleHome Laundry Liquid 2L',
    '9312680820030': 'ExampleDistillery Two Oak 700mL',
  };

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _resolve(String raw) async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final resolution =
          await ref.read(repositoryProvider).resolveBarcode(raw);
      setState(() => _result = resolution);
      if (!resolution.found) {
        setState(() {
          _error = 'Not in the catalogue yet. You can still watch it — '
              'it will be submitted for verification.';
        });
      }
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _watchFound() async {
    final product = _result?.product;
    if (product == null) return;
    await ref.read(watchlistProvider.notifier).watch(product);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${product.name} to your watchlist')),
      );
      context.go('/watchlist');
    }
  }

  Future<void> _simulateDeal() async {
    final product = _result?.product;
    if (product == null) return;
    final price = (product.netQuantity > 1500)
        ? 9.0
        : (product.category == 'liquor' ? 45.0 : 4.5);
    final created =
        await ref.read(repositoryProvider).simulateOffer(product, price);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(created > 0
              ? 'Qualifying offer ingested — $created signal(s) created'
              : 'Offer ingested (no rule triggered)'),
        ),
      );
      context.go('/signals');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDemo = ref.watch(demoModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Scan')),
      body: ListView(
        padding: const EdgeInsets.all(SsSpacing.m),
        children: [
          if (isDemo) ...[
            Container(
              padding: const EdgeInsets.all(SsSpacing.m),
              decoration: BoxDecoration(
                color: SsColors.infoBlue.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'Demo mode — type or paste one of the fixture barcodes. '
                'Camera scanning arrives with the store builds.',
                style: theme.textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: SsSpacing.m),
            for (final entry in _demoBarcodes.entries)
              ListTile(
                dense: true,
                leading: const Icon(Icons.qr_code_2),
                title: Text(entry.value),
                subtitle: Text(entry.key),
                onTap: () {
                  _controller.text = entry.key;
                  _resolve(entry.key);
                },
              ),
            const Divider(height: SsSpacing.xl),
          ],
          TextField(
            controller: _controller,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: 'Barcode number',
              helperText: 'EAN-8, UPC-A or EAN-13',
              suffixIcon: IconButton(
                icon: const Icon(Icons.search),
                onPressed: _busy ? null : () => _resolve(_controller.text),
              ),
            ),
            onSubmitted: _busy ? null : _resolve,
          ),
          const SizedBox(height: SsSpacing.m),
          if (_busy) const Center(child: CircularProgressIndicator()),
          if (_error != null)
            Container(
              padding: const EdgeInsets.all(SsSpacing.m),
              decoration: BoxDecoration(
                color: SsColors.signalAmber.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(_error!, style: theme.textTheme.bodySmall),
            ),
          if (_result?.found == true && _result?.product != null) ...[
            const SizedBox(height: SsSpacing.m),
            _FoundProductCard(
              product: _result!.product!,
              onWatch: _watchFound,
              onSimulate: isDemo ? _simulateDeal : null,
            ),
          ],
        ],
      ),
    );
  }
}

class _FoundProductCard extends StatelessWidget {
  const _FoundProductCard({
    required this.product,
    required this.onWatch,
    this.onSimulate,
  });

  final SsProduct product;
  final VoidCallback onWatch;
  final VoidCallback? onSimulate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SsSpacing.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${product.brand} ${product.name}',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Icon(
                  product.isVerified ? Icons.verified : Icons.help_outline,
                  size: 18,
                  color: product.isVerified
                      ? theme.colorScheme.primary
                      : SsColors.signalAmber,
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(product.identitySuffix, style: theme.textTheme.bodySmall),
            const SizedBox(height: SsSpacing.m),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onWatch,
                    icon: const Icon(Icons.visibility),
                    label: const Text('Watch this'),
                  ),
                ),
                if (onSimulate != null) ...[
                  const SizedBox(width: SsSpacing.s),
                  OutlinedButton(
                    onPressed: onSimulate,
                    child: const Text('Simulate deal'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
