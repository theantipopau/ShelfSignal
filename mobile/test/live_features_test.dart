import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shelfsignal/core/api_client.dart';
import 'package:shelfsignal/core/models.dart';
import 'package:shelfsignal/core/repository.dart';
import 'package:shelfsignal/features/notifications/notification_prefs_screen.dart';
import 'package:shelfsignal/features/shopping/shopping_list_screen.dart';
import 'package:shelfsignal/features/privacy/data_export_screen.dart';
import 'package:shelfsignal/features/products/product_detail_screen.dart';

/// Live-mode repository stub: records writes, serves canned reads.
class _LiveRepository extends Repository {
  _LiveRepository() : super(ApiClient());

  final patches = <Map<String, dynamic>>[];
  final doneCalls = <(String, bool)>[];
  var prefs = const NotificationPrefs();
  var items = <ShoppingItem>[
    const ShoppingItem(id: 'a', title: 'Milk', quantity: 2, status: 'open'),
  ];

  @override
  bool get isDemo => false;

  @override
  Future<NotificationPrefs> getNotificationPrefs() async => prefs;

  @override
  Future<NotificationPrefs> updateNotificationPrefs(Map<String, dynamic> patch) async {
    patches.add(patch);
    return prefs = NotificationPrefs(digestMode: patch['digest_mode'] as bool? ?? prefs.digestMode);
  }

  @override
  Future<List<ShoppingItem>> listShoppingItems() async => items;

  @override
  Future<Map<String, dynamic>> exportData() async => {
        'watch_items': [{}, {}],
        'signals': <Object>[],
        'notification_preferences': null,
        'household': null,
      };

  @override
  Future<SsProduct> getProduct(String id) async => SsProduct(
        id: id,
        name: 'Vegemite',
        brand: 'Kraft',
        category: 'grocery',
        netQuantity: 380,
        unit: 'g',
        verificationStatus: 'verified',
        barcode: '9310072011097',
      );

  @override
  Future<void> setShoppingItemDone(String id, bool done) async {
    doneCalls.add((id, done));
    items = [];
  }
}

Future<void> _pump(WidgetTester tester, Widget screen, Repository repo) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [repositoryProvider.overrideWithValue(repo)],
    child: MaterialApp(home: screen),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('live feature models', () {
    test('ShoppingItem reads shared from household_id', () {
      final shared = ShoppingItem.fromJson({'id': '1', 'title': 'Eggs', 'quantity': 1, 'status': 'open', 'household_id': 'h'});
      final private = ShoppingItem.fromJson({'id': '2', 'title': 'Soap', 'quantity': 1, 'status': 'done', 'household_id': null});
      expect(shared.shared, isTrue);
      expect(private.shared, isFalse);
      expect(private.isDone, isTrue);
    });

    test('Household parses members and invites from the detail call', () {
      final h = Household.fromJson({
        'id': 'h1',
        'name': 'Flat 3',
        'role': 'owner',
        'members': [
          {'user_id': 'u1', 'role': 'owner', 'email': 'a@x.test', 'display_name': 'Ann'},
          {'user_id': 'u2', 'role': 'member', 'email': 'b@x.test'},
        ],
        'invites': [
          {'id': 'i1', 'invitee_email': null, 'expires_at': '2030-01-01T00:00:00.000Z'},
        ],
      });
      expect(h.isOwner, isTrue);
      expect(h.members.length, 2);
      expect(h.members.first.displayName, 'Ann');
      expect(h.invites.single.inviteeEmail, isNull);
    });

    test('NotificationPrefs maps server field names', () {
      final p = NotificationPrefs.fromJson({
        'global_enabled': false,
        'quiet_hours_enabled': true,
        'quiet_hours_start': '23:00',
        'per_product_cooldown_hours': 48,
      });
      expect(p.globalEnabled, isFalse);
      expect(p.quietHoursStart, '23:00');
      expect(p.quietHoursEnd, '07:00'); // default when absent
      expect(p.cooldownHours, 48);
    });
  });

  group('demo mode', () {
    testWidgets('shopping list shows the live-only notice and makes no call', (tester) async {
      await _pump(tester, const ShoppingListScreen(), Repository(ApiClient()));
      expect(find.textContaining('needs a live account'), findsOneWidget);
    });

    testWidgets('notification preferences show the live-only notice', (tester) async {
      await _pump(tester, const NotificationPrefsScreen(), Repository(ApiClient()));
      expect(find.textContaining('needs a live account'), findsOneWidget);
    });
  });

  group('live mode', () {
    testWidgets('data export shows per-section counts', (tester) async {
      await _pump(tester, const DataExportScreen(), _LiveRepository());
      expect(find.text('Watchlist items'), findsOneWidget);
      expect(find.text('2'), findsOneWidget); // two watch items
    });

    testWidgets('product detail loads the product by id and offers a mismatch report', (tester) async {
      await _pump(tester, const ProductDetailScreen(productId: 'p1'), _LiveRepository());
      expect(find.text('Kraft Vegemite'), findsOneWidget);
      expect(find.text('Report a mismatch'), findsOneWidget);
    });

    testWidgets('toggling digest saves only that field', (tester) async {
      final repo = _LiveRepository();
      await _pump(tester, const NotificationPrefsScreen(), repo);

      await tester.tap(find.widgetWithText(SwitchListTile, 'Daily digest'));
      await tester.pumpAndSettle();

      expect(repo.patches, [
        {'digest_mode': true},
      ]);
    });

    testWidgets('ticking an item marks it done on the server', (tester) async {
      final repo = _LiveRepository();
      await _pump(tester, const ShoppingListScreen(), repo);

      expect(find.text('Milk'), findsOneWidget);
      expect(find.text('× 2'), findsOneWidget);
      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();

      expect(repo.doneCalls, [('a', true)]);
      expect(find.text('Milk'), findsNothing); // list refreshed after the write
    });
  });
}
