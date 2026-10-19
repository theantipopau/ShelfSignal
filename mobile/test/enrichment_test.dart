import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shelfsignal/core/api_client.dart';
import 'package:shelfsignal/core/models.dart';
import 'package:shelfsignal/core/repository.dart';
import 'package:shelfsignal/features/products/enrichment_section.dart';

/// Repository stub: returns a canned enrichment without touching the network.
class _FakeRepository extends Repository {
  _FakeRepository(this.result, {this.fail = false}) : super(ApiClient());

  final ProductEnrichment? result;
  final bool fail;

  @override
  bool get isDemo => false;

  @override
  Future<ProductEnrichment?> enrichBarcode(String barcode) async {
    if (fail) throw Exception('offline');
    return result;
  }
}

Future<void> _pump(WidgetTester tester, Repository repo, {bool showIdentity = false}) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: EnrichmentSection(barcode: '9310072011097', showIdentity: showIdentity),
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('ProductEnrichment.fromJson', () {
    test('parses identity, photo and community prices', () {
      final e = ProductEnrichment.fromJson({
        'identity': {'canonical_name': 'Vegemite', 'brand': 'Kraft', 'category': 'grocery', 'image_url': 'https://x/y.jpg'},
        'communityPrices': [
          {'price': 5.5, 'date': '2026-09-01', 'location': {'brand': 'Woolworths', 'city': 'Sydney'}},
          {'price': 4, 'location': {'name': 'Corner Shop'}},
        ],
      });
      expect(e.identity!.name, 'Vegemite');
      expect(e.identity!.imageUrl, 'https://x/y.jpg');
      expect(e.communityPrices!.first.store, 'Woolworths');
      expect(e.communityPrices!.last.store, 'Corner Shop');
      expect(e.communityPrices!.last.price, 4.0);
    });

    test('null sources stay null (unavailable, not an error)', () {
      final e = ProductEnrichment.fromJson({'identity': null, 'communityPrices': null});
      expect(e.identity, isNull);
      expect(e.communityPrices, isNull);
    });
  });

  group('EnrichmentSection', () {
    testWidgets('shows community prices and the identity name for unknown barcodes', (tester) async {
      await _pump(
        tester,
        _FakeRepository(ProductEnrichment.fromJson({
          'identity': {'canonical_name': 'Vegemite', 'brand': 'Kraft', 'category': 'grocery'},
          'communityPrices': [
            {'price': 5.5, 'date': '2026-09-01', 'location': {'brand': 'Woolworths', 'city': 'Sydney'}},
          ],
        })),
        showIdentity: true,
      );
      expect(find.text('Vegemite'), findsOneWidget);
      expect(find.textContaining('Woolworths, Sydney'), findsOneWidget);
    });

    testWidgets('says so when Open Prices has nothing', (tester) async {
      await _pump(tester, _FakeRepository(const ProductEnrichment(communityPrices: [])));
      expect(find.text('No community prices for this barcode yet.'), findsOneWidget);
    });

    testWidgets('says so when Open Prices is unreachable', (tester) async {
      await _pump(tester, _FakeRepository(const ProductEnrichment()));
      expect(find.text('Open Prices is unreachable right now.'), findsOneWidget);
    });

    testWidgets('reports a failed request without crashing', (tester) async {
      await _pump(tester, _FakeRepository(null, fail: true));
      expect(find.text('Could not load photo or community prices.'), findsOneWidget);
    });

    testWidgets('demo mode makes no request and says live mode is needed', (tester) async {
      await _pump(tester, Repository(ApiClient()));
      expect(find.text('Photos and community prices are available in live mode.'), findsOneWidget);
    });
  });
}
