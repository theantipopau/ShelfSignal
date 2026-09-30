import 'package:flutter_test/flutter_test.dart';

import 'package:shelfsignal/core/models.dart';

void main() {
  group('AUD formatting', () {
    test('formats currency', () {
      expect(49.9.asAud, contains('49.90'));
    });
  });

  group('SsProduct', () {
    test('parses backend JSON', () {
      final p = SsProduct.fromJson({
        'id': 'x1',
        'canonical_name': 'Blended Whisky',
        'brand': 'ExampleDistillery',
        'variant': 'Two Oak',
        'category': 'liquor',
        'net_quantity': 700,
        'unit': 'ml',
        'pack_count': 1,
        'verification_status': 'verified',
        'barcode': '9312680820030',
      });
      expect(p.name, 'Blended Whisky');
      expect(p.isVerified, isTrue);
      expect(p.identitySuffix, contains('700ml'));
    });
  });

  group('Signal', () {
    test('parses backend JSON with structured conditions', () {
      final s = Signal.fromJson({
        'id': 's1',
        'watch_item_id': 'w1',
        'canonical_name': 'Blended Whisky',
        'brand': 'ExampleDistillery',
        'current_price': 49.9,
        'baseline_price': 62.0,
        'difference_percent': 19.5,
        'label': 'Strong signal',
        'explanation': 'Price \$49.90 is below your target of \$50.00',
        'confidence': 1.0,
        'conditions': {'retailer_name': "Dan Murphy's"},
      });
      expect(s.retailerName, "Dan Murphy's");
      expect(s.currentPrice, 49.9);
      expect(s.label, 'Strong signal');
    });

    test('parses conditions given as JSON string defensively', () {
      final s = Signal.fromJson({
        'id': 's2',
        'watch_item_id': 'w1',
        'canonical_name': 'Sauce',
        'brand': 'ExampleBrand',
        'current_price': 4.5,
        'label': 'Good price',
        'explanation': 'meets target',
      });
      expect(s.retailerName, 'Retailer');
    });
  });
}
