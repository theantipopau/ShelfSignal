import 'models.dart';

/// In-memory fixture backend for demo mode (no server, no permissions).
/// Mirrors backend/src/migrations/seed_fixtures.js so the two stay aligned.
///
/// The demo store implements the same vertical slice as the API:
/// resolve barcode -> watch -> set rule -> ingest offer -> explainable signal.
class DemoBackend {
  DemoBackend._();

  static final DemoBackend instance = DemoBackend._();

  final List<SsProduct> products = [
    const SsProduct(
      id: 'demo-p1',
      name: 'Tomato Pasta Sauce',
      brand: 'ExampleBrand',
      variant: 'Basil & Oregano',
      category: 'grocery',
      netQuantity: 500,
      unit: 'ml',
      verificationStatus: 'verified',
      barcode: '9310640020223',
    ),
    const SsProduct(
      id: 'demo-p2',
      name: 'Laundry Liquid',
      brand: 'ExampleHome',
      variant: 'Fresh Sensitive',
      category: 'cleaning',
      netQuantity: 2000,
      unit: 'ml',
      verificationStatus: 'verified',
      barcode: '9300675046257',
    ),
    const SsProduct(
      id: 'demo-p3',
      name: 'Blended Whisky',
      brand: 'ExampleDistillery',
      variant: 'Two Oak',
      category: 'liquor',
      netQuantity: 700,
      unit: 'ml',
      verificationStatus: 'verified',
      barcode: '9312680820030',
    ),
  ];

  /// Offers per product id, freshest first.
  final Map<String, List<RetailerOffer>> offers = {
    'demo-p1': [
      RetailerOffer(
        retailerSlug: 'coles',
        retailerName: 'Coles',
        price: 4.50,
        observedAt: DateTime.now().subtract(const Duration(minutes: 30)),
      ),
      RetailerOffer(
        retailerSlug: 'woolworths',
        retailerName: 'Woolworths',
        price: 6.50,
        observedAt: DateTime.now().subtract(const Duration(hours: 3)),
      ),
    ],
    'demo-p2': [
      RetailerOffer(
        retailerSlug: 'coles',
        retailerName: 'Coles',
        price: 12.00,
        observedAt: DateTime.now().subtract(const Duration(hours: 1)),
      ),
    ],
    'demo-p3': [
      RetailerOffer(
        retailerSlug: 'dan-murphys',
        retailerName: "Dan Murphy's",
        price: 49.90,
        observedAt: DateTime.now().subtract(const Duration(minutes: 18)),
      ),
      RetailerOffer(
        retailerSlug: 'woolworths',
        retailerName: 'Woolworths',
        price: 65.00,
        observedAt: DateTime.now().subtract(const Duration(hours: 5)),
      ),
    ],
  };

  final List<DemoWatch> watches = [];
  final List<Signal> signals = [];
  final List<String> scanHistory = [];
  int _seq = 0;

  String _nextId(String prefix) {
    _seq += 1;
    return 'demo-$prefix-$_seq';
  }

  SsProduct? findByBarcode(String barcode) {
    for (final p in products) {
      if (p.barcode == barcode) return p;
    }
    return null;
  }

  WatchItem watch({required String owner, required SsProduct product}) {
    final existing =
        watches.where((w) => w.owner == owner && w.productId == product.id);
    if (existing.isNotEmpty) return existing.first.toWatchItem(this);
    final w = DemoWatch(
      id: _nextId('w'),
      owner: owner,
      productId: product.id,
    );
    watches.add(w);
    return w.toWatchItem(this);
  }

  void setRule({
    required String watchItemId,
    required String ruleType,
    double? targetPrice,
    double? minDiscountPercent,
  }) {
    for (final w in watches) {
      if (w.id == watchItemId) {
        w.ruleType = ruleType;
        w.targetPrice = targetPrice;
        w.minDiscountPercent = minDiscountPercent;
      }
    }
  }

  List<WatchItem> listWatches(String owner) => watches
      .where((w) => w.owner == owner)
      .map((w) => w.toWatchItem(this))
      .toList();

  void removeWatch(String owner, String watchItemId) {
    watches.removeWhere((w) => w.owner == owner && w.id == watchItemId);
    signals.removeWhere((s) => s.watchItemId == watchItemId);
  }

  /// Ingest a fresh fixture offer and evaluate every enabled rule.
  List<Signal> ingest({
    required String productId,
    required String retailerSlug,
    required String retailerName,
    required double price,
  }) {
    offers[productId]?.insert(
      0,
      RetailerOffer(
        retailerSlug: retailerSlug,
        retailerName: retailerName,
        price: price,
        observedAt: DateTime.now(),
      ),
    );

    final created = <Signal>[];
    for (final w in watches.where((w) => w.productId == productId)) {
      final item = w.toWatchItem(this);
      final signal = _evaluate(item, price);
      if (signal != null) created.add(signal);
    }
    return created;
  }

  /// Domain logic mirrors backend/src/domain/signalEvaluator.js.
  Signal? _evaluate(WatchItem item, double price) {
    if (item.ruleType == null || item.ruleType == 'none') return null;
    if (item.isSnoozed) return null;
    // Cooldown: skip if a signal for this item fired within cooldownHours.
    final last = signals
        .where((s) => s.watchItemId == item.id)
        .fold<DateTime?>(null, (acc, s) => acc == null || s.triggeredAt.isAfter(acc) ? s.triggeredAt : acc);
    if (last != null &&
        DateTime.now().difference(last) < Duration(hours: item.cooldownHours)) {
      return null;
    }

    String? explanation;
    String label;
    switch (item.ruleType) {
      case 'target_price':
        final t = item.targetPrice;
        if (t == null) return null;
        if (price > t) return null;
        final below = t - price;
        label = below >= t * 0.1 ? 'Strong signal' : 'Good price';
        explanation = below > 0
            ? 'Price ${price.asAud} is below your target of ${t.asAud} by ${below.asAud}'
            : 'Price ${price.asAud} meets your target of ${t.asAud}';
        break;
      case 'discount_percent':
        final minPct = item.minDiscountPercent ?? 20;
        final baseline = _baselineFor(item.product.id);
        if (baseline == null) return null;
        final pct = (baseline - price) / baseline * 100;
        if (pct < minPct) return null;
        label = pct >= 40 ? 'Strong signal' : 'Good price';
        explanation =
            '${pct.toStringAsFixed(0)}% below the observed usual price of ${baseline.asAud}';
        break;
      default:
        return null;
    }

    final baseline = _baselineFor(item.product.id);
    final signal = Signal(
      id: _nextId('s'),
      watchItemId: item.id,
      product: item.product,
      retailerName: _freshestRetailer(item.product.id),
      currentPrice: price,
      baselinePrice: baseline,
      historicalLow: _lowFor(item.product.id),
      differenceAmount: baseline == null ? null : baseline - price,
      differencePercent:
          baseline == null || baseline == 0 ? null : (baseline - price) / baseline * 100,
      label: label,
      explanation: explanation,
      confidence: 1.0,
      triggeredAt: DateTime.now(),
      observedAt: DateTime.now(),
    );
    signals.insert(0, signal);
    return signal;
  }

  String _freshestRetailer(String productId) {
    final list = offers[productId];
    if (list == null || list.isEmpty) return 'Retailer';
    return list.first.retailerName;
  }

  /// Observed usual price: median of recent offers (robust baseline).
  double? _baselineFor(String productId) {
    final list = offers[productId];
    if (list == null || list.isEmpty) return null;
    final prices = list.map((o) => o.price).toList()..sort();
    return prices[prices.length ~/ 2];
  }

  double? _lowFor(String productId) {
    final list = offers[productId];
    if (list == null || list.isEmpty) return null;
    return list.map((o) => o.price).reduce((a, b) => a < b ? a : b);
  }

  List<Signal> listSignals(String owner) {
    final ids = watches.where((w) => w.owner == owner).map((w) => w.id).toSet();
    return signals.where((s) => ids.contains(s.watchItemId)).toList();
  }

  void actOnSignal(String owner, String signalId, {required bool bought}) {
    Signal? signal;
    for (final s in signals) {
      if (s.id == signalId) {
        signal = s;
        break;
      }
    }
    if (signal == null) return;
    signals.removeWhere((s) => s.id == signalId);
    if (!bought) return;
    // Mark as bought: brief snooze on the watch item, mirroring the API.
    for (final w in watches) {
      if (w.owner == owner && w.id == signal.watchItemId) {
        w.snoozedUntil = DateTime.now().add(const Duration(hours: 48));
      }
    }
  }

  void snooze(String watchItemId) {
    for (final w in watches) {
      if (w.id == watchItemId) {
        w.snoozedUntil = DateTime.now().add(const Duration(days: 7));
      }
    }
  }

  void recordScan(String barcode) {
    scanHistory.insert(0, barcode);
  }
}

/// A demo watch row: owner + product + editable rule.
class DemoWatch {
  DemoWatch({
    required this.id,
    required this.owner,
    required this.productId,
    this.ruleType,
    this.targetPrice,
    this.minDiscountPercent,
    this.snoozedUntil,
  });

  final String id;
  final String owner;
  final String productId;
  String? ruleType;
  double? targetPrice;
  double? minDiscountPercent;
  DateTime? snoozedUntil;

  WatchItem toWatchItem(DemoBackend backend) {
    SsProduct? product;
    for (final p in backend.products) {
      if (p.id == productId) {
        product = p;
        break;
      }
    }
    final offerList = backend.offers[productId] ?? const <RetailerOffer>[];
    final freshest = offerList.isEmpty ? null : offerList.first;
    return WatchItem(
      id: id,
      product: product!,
      ruleType: ruleType == 'none' ? null : ruleType,
      targetPrice: targetPrice,
      minDiscountPercent: minDiscountPercent,
      currentPrice: freshest?.price,
      lastCheckedAt: freshest?.observedAt,
      snoozedUntil: snoozedUntil,
    );
  }
}

/// Parse+validate a barcode exactly like the backend's GS1 check:
/// digits-only + supported length + mod-10 check digit.
class BarcodeValidator {
  static const Set<int> _lengths = {8, 12, 13, 14};

  static String? normalize(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (!_lengths.contains(digits.length)) return null;
    var sum = 0;
    final body =
        digits.substring(0, digits.length - 1).split('').map(int.parse).toList();
    for (var i = 0; i < body.length; i++) {
      sum += body[body.length - 1 - i] * (i.isEven ? 3 : 1);
    }
    final expected = (10 - (sum % 10)) % 10;
    if (expected != int.parse(digits.substring(digits.length - 1))) return null;
    return digits.length == 12 ? '0$digits' : digits;
  }
}
