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
