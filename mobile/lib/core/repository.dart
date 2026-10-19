import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'demo_backend.dart';
import 'models.dart';

/// Repository facade: routes calls to the live API or the demo backend.
/// Keeps providers free of mode-specific branching.
class Repository {
  Repository(this._api);

  final ApiClient _api;

  bool get isDemo => _api.isDemo;

  DemoBackend get _demo => DemoBackend.instance;

  // ---- Auth ----------------------------------------------------------------
  Future<String?> resolveToken() async {
    await _api.loadPersisted();
    return _api.token;
  }

  Future<AuthResult> register(String email, String password, String? displayName) async {
    if (isDemo) {
      return AuthResult(token: 'demo-token', email: email);
    }
    final body = await _api.postRaw('/api/auth/register', {
      'email': email,
      'password': password,
      if (displayName != null) 'displayName': displayName,
    });
    final data = body['data'] as Map<String, dynamic>;
    final user = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String;
    await _api.setToken(token);
    return AuthResult(token: token, email: user['email'] as String);
  }

  Future<AuthResult> login(String email, String password) async {
    if (isDemo) {
      return AuthResult(token: 'demo-token', email: email);
    }
    final body = await _api.postRaw('/api/auth/login', {
      'email': email,
      'password': password,
    });
    final data = body['data'] as Map<String, dynamic>;
    final token = data['token'] as String;
    await _api.setToken(token);
    return AuthResult(token: token, email: email);
  }

  Future<void> signOut() => _api.setToken(null);

  // ---- Products ------------------------------------------------------------
  Future<BarcodeResolution> resolveBarcode(String barcode) async {
    if (isDemo) {
      final normalized = BarcodeValidator.normalize(barcode);
      if (normalized == null) {
        throw ApiException('That barcode does not look valid. Try again or type it manually.');
      }
      final product = _demo.findByBarcode(normalized);
      _demo.recordScan(normalized);
      return BarcodeResolution(
        found: product != null,
        barcode: normalized,
        product: product,
      );
    }
    final data = await _api.post('/api/products/resolve-barcode', {'barcode': barcode});
    if (data == null) return BarcodeResolution(found: false, barcode: barcode);
    final found = data['found'] as bool? ?? false;
    return BarcodeResolution(
      found: found,
      barcode: (data['barcode'] as String?) ?? barcode,
      product: found && data['product'] != null
          ? SsProduct.fromJson(data['product'] as Map<String, dynamic>)
          : null,
    );
  }

  /// Photo + community prices for a barcode. Demo mode makes no network calls.
  Future<ProductEnrichment?> enrichBarcode(String barcode) async {
    if (isDemo) return null;
    final data = await _api.get('/api/products/enrichment/$barcode');
    return data == null ? null : ProductEnrichment.fromJson(data);
  }

  // ---- Live-only features: shopping list, preferences, households, reports --
  // No demo fixtures exist for these. Screens check isDemo first and show a
  // notice instead of calling in, so these methods assume a live API.
  Future<List<ShoppingItem>> listShoppingItems() async {
    final rows = await _api.getList('/api/shopping-list?status=open');
    return rows.map((r) => ShoppingItem.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<void> addShoppingItem(String title, {int quantity = 1, bool shared = false}) =>
      _api.post('/api/shopping-list', {'title': title, 'quantity': quantity, 'shared': shared});

  Future<void> setShoppingItemDone(String id, bool done) =>
      _api.patch('/api/shopping-list/$id', {'status': done ? 'done' : 'open'});

  Future<void> deleteShoppingItem(String id) => _api.delete('/api/shopping-list/$id');

  Future<NotificationPrefs> getNotificationPrefs() async =>
      NotificationPrefs.fromJson((await _api.get('/api/notifications/preferences')) ?? {});

  Future<NotificationPrefs> updateNotificationPrefs(Map<String, dynamic> patch) async =>
      NotificationPrefs.fromJson((await _api.patch('/api/notifications/preferences', patch)) ?? {});

  Future<List<Household>> listHouseholds() async {
    final rows = await _api.getList('/api/households');
    return rows.map((r) => Household.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<Household> getHousehold(String id) async =>
      Household.fromJson((await _api.get('/api/households/$id'))!);

  Future<void> createHousehold(String name) => _api.post('/api/households', {'name': name});

  /// Returns the invite token. The server shows it once and never stores it.
  Future<String> createInvite(String householdId, {String? email}) async {
    final data = await _api.post('/api/households/$householdId/invites', {
      if (email != null && email.isNotEmpty) 'email': email,
    });
    return data!['token'] as String;
  }

  Future<void> acceptInvite(String token) => _api.post('/api/households/invites/accept', {'token': token});

  /// Owners remove others; any member can pass their own userId to leave.
  Future<void> removeMember(String householdId, String userId) =>
      _api.delete('/api/households/$householdId/members/$userId');

  Future<void> revokeInvite(String householdId, String inviteId) =>
      _api.delete('/api/households/$householdId/invites/$inviteId');

  /// kind: mismatch | wrong_details | other (spec 9.8).
  Future<void> reportProduct(String productId, {String kind = 'mismatch', String? note}) =>
      _api.post('/api/products/$productId/reports', {
        'kind': kind,
        if (note != null && note.isNotEmpty) 'note': note,
      });

  /// Canonical product by id (GET /api/products/:id). Live mode only: demo products come from fixtures.
  Future<SsProduct> getProduct(String id) async {
    final data = await _api.get('/api/products/$id');
    if (data == null) throw ApiException('Product not found');
    final barcodes = (data['barcodes'] as List<dynamic>? ?? const []);
    return SsProduct.fromJson({
      ...data,
      'barcode': barcodes.isEmpty ? null : (barcodes.first as Map<String, dynamic>)['barcode'],
    });
  }

  /// Everything the server holds about the signed-in user (GET /api/auth/export, spec 17).
  Future<Map<String, dynamic>> exportData() async {
    final data = await _api.get('/api/auth/export');
    if (data == null) throw ApiException('Export is only available in live mode');
    return data;
  }

  Future<List<SsProduct>> searchProducts(String query) async {
    if (isDemo) {
      final q = query.toLowerCase();
      return _demo.products
          .where((p) =>
              p.name.toLowerCase().contains(q) ||
              p.brand.toLowerCase().contains(q) ||
              (p.barcode ?? '').contains(q))
          .toList();
    }
    final rows = await _api.getList('/api/products/search?q=${Uri.encodeComponent(query)}');
    return rows.map((r) => SsProduct.fromJson(r as Map<String, dynamic>)).toList();
  }

  // ---- Watchlist -----------------------------------------------------------
  Future<List<WatchItem>> listWatchItems() async {
    if (isDemo) {
      return _demo.listWatches('demo-user');
    }
    final rows = await _api.getList('/api/watchlist');
    return rows.map((r) => WatchItem.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<WatchItem> watchProduct(SsProduct product) async {
    if (isDemo) {
      return _demo.watch(owner: 'demo-user', product: product);
    }
    final data = await _api.post('/api/watchlist', {'productId': product.id});
    return WatchItem.fromJson(data!);
  }

  Future<void> removeWatchItem(String id) async {
    if (isDemo) {
      _demo.removeWatch('demo-user', id);
      return;
    }
    await _api.delete('/api/watchlist/$id');
  }

  Future<void> snoozeWatchItem(String id) async {
    if (isDemo) {
      _demo.snooze(id);
      return;
    }
    await _api.patch('/api/watchlist/$id', {
      'snoozed_until': DateTime.now().add(const Duration(days: 7)).toIso8601String(),
    });
  }

  Future<void> setRule({
    required String watchItemId,
    required String ruleType,
    double? targetPrice,
    double? minDiscountPercent,
  }) async {
    if (isDemo) {
      _demo.setRule(
        watchItemId: watchItemId,
        ruleType: ruleType,
        targetPrice: targetPrice,
        minDiscountPercent: minDiscountPercent,
      );
      return;
    }
    final payload = <String, dynamic>{
      'ruleType': ruleType,
      if (targetPrice != null) 'targetPrice': targetPrice,
      if (minDiscountPercent != null) 'minimumDiscountPercent': minDiscountPercent,
      'cooldownHours': 24,
    };
    await _api.post('/api/watchlist/$watchItemId/rules', payload);
  }

  /// Simulate a qualifying offer for demo verification of the full loop.
  Future<int> simulateOffer(SsProduct product, double price) async {
    if (isDemo) {
      final created = _demo.ingest(
        productId: product.id,
        retailerSlug: 'coles',
        retailerName: 'Coles',
        price: price,
      );
      return created.length;
    }
    final data = await _api.post('/api/retailers/ingest-fixture', {
      'barcode': product.barcode,
      'retailerSlug': 'coles',
      'price': price,
    });
    return (data?['signalsCreated'] as num?)?.toInt() ?? 0;
  }

  // ---- Signals -------------------------------------------------------------
  Future<List<Signal>> listSignals() async {
    if (isDemo) {
      return _demo.listSignals('demo-user');
    }
    final rows = await _api.getList('/api/signals');
    return rows.map((r) => Signal.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<void> dismissSignal(String id) async {
    if (isDemo) {
      _demo.actOnSignal('demo-user', id, bought: false);
      return;
    }
    await _api.post('/api/signals/$id/dismiss', {});
  }

  Future<void> markBought(String id) async {
    if (isDemo) {
      _demo.actOnSignal('demo-user', id, bought: true);
      return;
    }
    await _api.post('/api/signals/$id/mark-bought', {});
  }
}

class AuthResult {
  AuthResult({required this.token, required this.email});
  final String token;
  final String email;
}

final repositoryProvider = Provider<Repository>((ref) {
  return Repository(ref.watch(apiClientProvider));
});
