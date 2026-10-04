import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/demo_backend.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../providers.dart';

/// How long the same camera code is suppressed after a read (spec 9.3
/// "duplicate detection" — one resolve per scan, not per video frame).
const Duration _duplicateSuppressWindow = Duration(seconds: 4);

/// Scan tab (spec 9.3).
///
/// - Permission timing (spec 9.2): the OS camera prompt fires only when the
///   user taps "Start camera"; the rationale is shown first.
/// - GTIN-only detection (EAN-8, UPC-A/E, EAN-13) + GS1 check-digit gate.
/// - Haptic + visual confirmation, duplicate suppression, torch control.
/// - Manual entry stays always available as the accessible fallback.
/// - Camera frames are analysed on-device and never stored or uploaded.
class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

enum _CameraPhase { off, starting, active, failed }

class _ScannerScreenState extends ConsumerState<ScannerScreen> {
  final _entryController = TextEditingController();

  MobileScannerController? _camera;
  _CameraPhase _phase = _CameraPhase.off;
  String? _cameraError;
  bool _torchOn = false;

  bool _busy = false;
  String? _error;
  String? _lastCode;
  DateTime? _lastCodeAt;
  BarcodeResolution? _result;

  /// Restrict detection to retail GTIN symbologies (spec 9.3). UPC-A is
  /// normalised to EAN-13 by [BarcodeValidator] when needed.
  static const List<BarcodeFormat> _gtinFormats = [
    BarcodeFormat.ean8,
    BarcodeFormat.ean13,
    BarcodeFormat.upcA,
    BarcodeFormat.upcE,
  ];

  static const Map<String, String> _demoBarcodes = {
    '9310640020223': 'ExampleBrand Tomato Pasta Sauce 500mL',
    '9300675046251': 'ExampleHome Laundry Liquid 2L',
    '9312680820030': 'ExampleDistillery Two Oak 700mL',
  };

  @override
  void dispose() {
    _camera?.dispose();
    _entryController.dispose();
    super.dispose();
  }

  // ---- Camera --------------------------------------------------------------

  Future<void> _startCamera() async {
    setState(() {
      _phase = _CameraPhase.starting;
      _cameraError = null;
    });
    final controller = MobileScannerController(
      autoStart: false,
      formats: _gtinFormats,
    );
    try {
      await controller.start();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _camera = controller;
        _phase = _CameraPhase.active;
        _torchOn = false;
      });
    } on MobileScannerException catch (e) {
      await controller.dispose();
      if (!mounted) return;
      setState(() {
        _phase = _CameraPhase.failed;
        // The enum name differs between mobile_scanner versions for the
        // denied case, so match on the shared suffix.
        _cameraError = e.errorCode.name.contains('Denied')
            ? 'Camera permission was declined. Enable it in system settings '
                'to scan, or type the barcode below.'
            : 'The camera could not start. You can still type the barcode '
                'below.';
      });
    }
  }

  Future<void> _stopCamera() async {
    await _camera?.dispose();
    _camera = null;
    if (!mounted) return;
    setState(() {
      _phase = _CameraPhase.off;
      _torchOn = false;
      _cameraError = null;
    });
  }

  void _onDetect(BarcodeCapture capture) {
    if (_busy) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw == null || raw.isEmpty) continue;
      final normalized = BarcodeValidator.normalize(raw);
      if (normalized == null) {
        setState(() {
          _error = 'Scanned code "$raw" failed the GTIN check. Type it '
              'manually if it looks right.';
        });
        continue;
      }
      final now = DateTime.now();
      if (normalized == _lastCode &&
          _lastCodeAt != null &&
          now.difference(_lastCodeAt!) < _duplicateSuppressWindow) {
        return;
      }
      _lastCode = normalized;
      _lastCodeAt = now;
      HapticFeedback.mediumImpact();
      unawaited(_resolve(normalized));
      return;
    }
  }

  Future<void> _toggleTorch() async {
    final camera = _camera;
    if (camera == null) return;
    try {
      await camera.toggleTorch();
      if (mounted) setState(() => _torchOn = !_torchOn);
    } catch (_) {
      // Torch is unavailable on some devices; scanning still works.
    }
  }

  // ---- Resolution ----------------------------------------------------------

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
      if (!mounted) return;
      setState(() => _result = resolution);
      if (!resolution.found) {
        setState(() {
          _error = 'Not in the catalogue yet. You can still watch it — '
              'it will be submitted for verification.';
        });
      }
    } catch (e) {
      if (!mounted) return;
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

  // ---- UI ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDemo = ref.watch(demoModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Scan')),
      body: ListView(
        padding: const EdgeInsets.all(SsSpacing.m),
        children: [
          _buildCameraSection(theme),
          const SizedBox(height: SsSpacing.m),
          if (isDemo) ...[
            Container(
              padding: const EdgeInsets.all(SsSpacing.m),
              decoration: BoxDecoration(
                color: SsColors.infoBlue.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'Demo mode — scan a real barcode or tap a fixture below. '
                'Same catalogues as the backend seed.',
                style: theme.textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: SsSpacing.s),
            for (final entry in _demoBarcodes.entries)
              ListTile(
                dense: true,
                leading: const Icon(Icons.qr_code_2),
                title: Text(entry.value),
                subtitle: Text(entry.key),
                onTap: () {
                  _entryController.text = entry.key;
                  _resolve(entry.key);
                },
              ),
            const Divider(height: SsSpacing.xl),
          ],
          TextField(
            controller: _entryController,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: 'Barcode number',
              helperText: 'EAN-8, UPC-A or EAN-13',
              suffixIcon: IconButton(
                tooltip: 'Look up barcode',
                icon: const Icon(Icons.search),
                onPressed: _busy ? null : () => _resolve(_entryController.text),
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

  Widget _buildCameraSection(ThemeData theme) {
    return switch (_phase) {
      _CameraPhase.active when _camera != null => _CameraPreview(
          controller: _camera!,
          torchOn: _torchOn,
          onDetect: _onDetect,
          onToggleTorch: _toggleTorch,
          onStop: _stopCamera,
        ),
      _CameraPhase.starting => const Center(
          child: Padding(
            padding: EdgeInsets.all(SsSpacing.l),
            child: CircularProgressIndicator(),
          ),
        ),
      _CameraPhase.failed => _CameraRationaleCard(
          headline: 'Camera unavailable',
          body: _cameraError!,
          actionLabel: 'Try again',
          onAction: _startCamera,
        ),
      _ => _CameraRationaleCard(
          headline: 'Scan with the camera',
          body: 'The camera is used only to read product barcodes. Frames '
              'are analysed on-device and never stored or uploaded.',
          actionLabel: 'Start camera',
          onAction: _startCamera,
        ),
    };
  }
}

/// Opt-in camera card: shown until the user explicitly starts the camera,
/// which is when the OS permission prompt appears (spec 9.2).
class _CameraRationaleCard extends StatelessWidget {
  const _CameraRationaleCard({
    required this.headline,
    required this.body,
    required this.actionLabel,
    required this.onAction,
  });

  final String headline;
  final String body;
  final String actionLabel;
  final VoidCallback onAction;

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
                Icon(Icons.photo_camera_outlined,
                    size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: SsSpacing.s),
                Text(headline, style: theme.textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: SsSpacing.s),
            Text(body, style: theme.textTheme.bodySmall),
            const SizedBox(height: SsSpacing.m),
            SizedBox(
              height: 44,
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: onAction,
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(actionLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CameraPreview extends StatelessWidget {
  const _CameraPreview({
    required this.controller,
    required this.torchOn,
    required this.onDetect,
    required this.onToggleTorch,
    required this.onStop,
  });

  final MobileScannerController controller;
  final bool torchOn;
  final void Function(BarcodeCapture) onDetect;
  final VoidCallback onToggleTorch;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 300,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            MobileScanner(
              controller: controller,
              onDetect: onDetect,
              fit: BoxFit.cover,
              errorBuilder: (context, error) => Container(
                color: SsColors.charcoal900,
                alignment: Alignment.center,
                padding: const EdgeInsets.all(SsSpacing.m),
                child: Text(
                  'Camera error — you can still type the barcode below.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: SsColors.textHighDark),
                ),
              ),
            ),
            // Scan reticle (visual confirmation zone).
            Center(
              child: IgnorePointer(
                child: Container(
                  width: 240,
                  height: 130,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: SsColors.signalGreen.withValues(alpha: 0.8),
                      width: 2,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: SsSpacing.s,
              right: SsSpacing.s,
              child: Row(
                children: [
                  _PreviewButton(
                    tooltip: torchOn ? 'Turn torch off' : 'Turn torch on',
                    icon: Icon(
                      torchOn ? Icons.flash_on : Icons.flash_off,
                      color: torchOn ? SsColors.signalAmber : Colors.white,
                    ),
                    onTap: onToggleTorch,
                  ),
                  const SizedBox(width: SsSpacing.s),
                  _PreviewButton(
                    tooltip: 'Stop camera',
                    icon: const Icon(Icons.close, color: Colors.white),
                    onTap: onStop,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewButton extends StatelessWidget {
  const _PreviewButton({
    required this.tooltip,
    required this.icon,
    required this.onTap,
  });

  final String tooltip;
  final Widget icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black.withValues(alpha: 0.45),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: icon,
          ),
        ),
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
