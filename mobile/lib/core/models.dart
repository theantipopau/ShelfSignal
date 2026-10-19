import 'package:intl/intl.dart';

/// Currency formatting (AUD — Australian market per spec section 1).
final NumberFormat _aud =
    NumberFormat.currency(locale: 'en_AU', symbol: r'$', decimalDigits: 2);

extension AudPrice on num {
  String get asAud => _aud.format(this);
}

/// A retailer offer for a canonical product.
class RetailerOffer {
  final String retailerSlug;
  final String retailerName;
  final double price;
  final DateTime observedAt;
  final bool isMemberPrice;

  const RetailerOffer({
    required this.retailerSlug,
    required this.retailerName,
    required this.price,
    required this.observedAt,
    this.isMemberPrice = false,
  });

  bool isFresh(Duration maxAge, DateTime now) =>
      now.difference(observedAt) <= maxAge;
}

/// Canonical product (spec section 12): identity separate from any listing.
class SsProduct {
  final String id;
  final String name;
  final String brand;
  final String? variant;
  final String category;
  final double netQuantity;
  final String unit;
  final int packCount;
  final String verificationStatus; // verified | unverified | ...
  final String? barcode;

  const SsProduct({
    required this.id,
    required this.name,
    required this.brand,
    this.variant,
    required this.category,
    required this.netQuantity,
    required this.unit,
    this.packCount = 1,
    required this.verificationStatus,
    this.barcode,
  });

  bool get isVerified => verificationStatus == 'verified';

  String get identitySuffix {
    final bits = <String>[
      if (variant != null && variant!.isNotEmpty) variant!,
      '${_fmtQty(netQuantity)}$unit',
      if (packCount > 1) 'x$packCount',
    ];
    return bits.join(' · ');
  }

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(1);

  factory SsProduct.fromJson(Map<String, dynamic> j) => SsProduct(
        id: j['id'] as String,
        name: (j['canonical_name'] ?? j['name'] ?? '') as String,
        brand: (j['brand'] ?? '') as String,
        variant: j['variant'] as String?,
        category: (j['category'] ?? 'grocery') as String,
        netQuantity: (j['net_quantity'] as num?)?.toDouble() ?? 0,
        unit: (j['unit'] ?? '') as String,
        packCount: (j['pack_count'] as num?)?.toInt() ?? 1,
        verificationStatus: (j['verification_status'] ?? 'unverified') as String,
        barcode: j['barcode'] as String?,
      );

  /// Demo-mode fixture (matches backend seed_fixtures.js).
  factory SsProduct.demo({
    required String id,
    required String name,
    required String brand,
    String? variant,
    required String category,
    required double qty,
    required String unit,
    String? barcode,
    String? abv,
  }) =>
      SsProduct(
        id: id,
        name: name,
        brand: brand,
        variant: variant,
        category: category,
        netQuantity: qty,
        unit: unit,
        verificationStatus: 'verified',
        barcode: barcode,
      );
}

/// A watch item joined with its rule and latest price (from GET /api/watchlist).
class WatchItem {
  final String id;
  final SsProduct product;
  final String? ruleType;
  final double? targetPrice;
  final double? minDiscountPercent;
  final int cooldownHours;
  final double? currentPrice;
  final DateTime? lastCheckedAt;
  final DateTime? snoozedUntil;
  final DateTime? lastBoughtAt;
  final int activeSignalCount;

  const WatchItem({
    required this.id,
    required this.product,
    this.ruleType,
    this.targetPrice,
    this.minDiscountPercent,
    this.cooldownHours = 24,
    this.currentPrice,
    this.lastCheckedAt,
    this.snoozedUntil,
    this.lastBoughtAt,
    this.activeSignalCount = 0,
  });

  bool get isSnoozed =>
      snoozedUntil != null && snoozedUntil!.isAfter(DateTime.now());

  factory WatchItem.fromJson(Map<String, dynamic> j) => WatchItem(
        id: j['id'] as String,
        product: SsProduct.fromJson(j),
        ruleType: j['rule_type'] as String?,
        targetPrice: (j['target_price'] as num?)?.toDouble(),
        minDiscountPercent: (j['minimum_discount_percent'] as num?)?.toDouble(),
        cooldownHours: (j['cooldown_hours'] as num?)?.toInt() ?? 24,
        currentPrice: (j['current_price'] as num?)?.toDouble(),
        lastCheckedAt: j['last_checked_at'] != null
            ? DateTime.parse(j['last_checked_at'] as String)
            : null,
        snoozedUntil: j['snoozed_until'] != null
            ? DateTime.parse(j['snoozed_until'] as String)
            : null,
        lastBoughtAt: j['last_bought_at'] != null
            ? DateTime.parse(j['last_bought_at'] as String)
            : null,
        activeSignalCount: (j['active_signal_count'] as num?)?.toInt() ?? 0,
      );
}

/// An explainable signal (GET /api/signals or fixture-generated in demo mode).
class Signal {
  final String id;
  final String watchItemId;
  final SsProduct product;
  final String retailerName;
  final double currentPrice;
  final double? baselinePrice;
  final double? historicalLow;
  final double? differenceAmount;
  final double? differencePercent;
  final String label; // Strong signal / Good price / Near your target ...
  final String explanation;
  final double confidence;
  final DateTime triggeredAt;
  final DateTime observedAt;

  const Signal({
    required this.id,
    required this.watchItemId,
    required this.product,
    required this.retailerName,
    required this.currentPrice,
    this.baselinePrice,
    this.historicalLow,
    this.differenceAmount,
    this.differencePercent,
    required this.label,
    required this.explanation,
    required this.confidence,
    required this.triggeredAt,
    required this.observedAt,
  });

  String get checkedAgo {
    final d = DateTime.now().difference(observedAt);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) return '${d.inHours} h ago';
    return '${d.inDays} d ago';
  }

  factory Signal.fromJson(Map<String, dynamic> j) => Signal(
        id: j['id'] as String,
        watchItemId: j['watch_item_id'] as String,
        product: SsProduct.fromJson(j),
        retailerName: _retailerName(j),
        currentPrice: (j['current_price'] as num).toDouble(),
        baselinePrice: (j['baseline_price'] as num?)?.toDouble(),
        historicalLow: (j['historical_low'] as num?)?.toDouble(),
        differenceAmount: (j['difference_amount'] as num?)?.toDouble(),
        differencePercent: (j['difference_percent'] as num?)?.toDouble(),
        label: (j['label'] ?? 'Good price') as String,
        explanation: (j['explanation'] ?? '') as String,
        confidence: (j['confidence'] as num?)?.toDouble() ?? 1.0,
        triggeredAt: j['triggered_at'] != null
            ? DateTime.parse(j['triggered_at'] as String)
            : DateTime.now(),
        observedAt: j['observed_at'] != null
            ? DateTime.parse(j['observed_at'] as String)
            : DateTime.now(),
      );

  static String _retailerName(Map<String, dynamic> j) {
    final c = j['conditions'];
    if (c is Map) {
      return (c['retailer_name'] ?? 'Retailer') as String;
    }
    if (c is String && c.isNotEmpty) {
      try {
        final decoded = c.startsWith('{')
            ? _decodeJson(c)
            : null;
        if (decoded != null) {
          return (decoded['retailer_name'] ?? 'Retailer') as String;
        }
      } catch (_) {}
    }
    return 'Retailer';
  }

  static Map<String, dynamic>? _decodeJson(String s) {
    // Minimal inline decode avoided; backend stores structured JSONB and the
    // API returns a map. Kept for defensive parity with demo fixtures.
    return null;
  }
}

/// Result of resolving a scanned/typed barcode.
class BarcodeResolution {
  final bool found;
  final String barcode;
  final SsProduct? product;

  const BarcodeResolution({
    required this.found,
    required this.barcode,
    this.product,
  });
}

/// Open Food Facts identity for a barcode (free, ODbL). Photo is CC BY-SA.
class ExternalIdentity {
  final String name;
  final String brand;
  final String category;
  final String? imageUrl;
  final String? webUrl;

  const ExternalIdentity({
    required this.name,
    required this.brand,
    required this.category,
    this.imageUrl,
    this.webUrl,
  });

  factory ExternalIdentity.fromJson(Map<String, dynamic> j) => ExternalIdentity(
        name: (j['canonical_name'] ?? 'Unknown product') as String,
        brand: (j['brand'] ?? '') as String,
        category: (j['category'] ?? 'grocery') as String,
        imageUrl: j['image_url'] as String?,
        webUrl: j['webUrl'] as String?,
      );
}

/// One crowd-submitted shelf price from Open Prices (AUD, Australian stores only).
class CommunityPrice {
  final double price;
  final String? date;
  final String store;
  final String? city;

  const CommunityPrice({
    required this.price,
    this.date,
    required this.store,
    this.city,
  });

  factory CommunityPrice.fromJson(Map<String, dynamic> j) {
    final loc = (j['location'] as Map<String, dynamic>?) ?? const {};
    return CommunityPrice(
      price: (j['price'] as num).toDouble(),
      date: j['date'] as String?,
      store: (loc['brand'] ?? loc['name'] ?? 'Unknown store') as String,
      city: loc['city'] as String?,
    );
  }
}

/// GET /api/products/enrichment/:barcode. A null field means that source is
/// unavailable (communityPrices) or has no record (identity), never an error.
class ProductEnrichment {
  final ExternalIdentity? identity;
  final List<CommunityPrice>? communityPrices;

  const ProductEnrichment({this.identity, this.communityPrices});

  factory ProductEnrichment.fromJson(Map<String, dynamic> j) => ProductEnrichment(
        identity: j['identity'] == null
            ? null
            : ExternalIdentity.fromJson(j['identity'] as Map<String, dynamic>),
        communityPrices: j['communityPrices'] == null
            ? null
            : [
                for (final r in j['communityPrices'] as List<dynamic>)
                  CommunityPrice.fromJson(r as Map<String, dynamic>),
              ],
      );
}

/// A shopping list item (GET /api/shopping-list). `shared` means it is visible to the household.
class ShoppingItem {
  final String id;
  final String title;
  final int quantity;
  final String status; // open | done
  final String? barcode;
  final String? ownerUserId;
  final bool shared;

  const ShoppingItem({
    required this.id,
    required this.title,
    required this.quantity,
    required this.status,
    this.barcode,
    this.ownerUserId,
    this.shared = false,
  });

  bool get isDone => status == 'done';

  factory ShoppingItem.fromJson(Map<String, dynamic> j) => ShoppingItem(
        id: j['id'] as String,
        title: (j['title'] ?? '') as String,
        quantity: (j['quantity'] as num?)?.toInt() ?? 1,
        status: (j['status'] ?? 'open') as String,
        barcode: j['barcode'] as String?,
        ownerUserId: j['owner_user_id'] as String?,
        shared: j['household_id'] != null,
      );
}

class HouseholdMember {
  final String userId;
  final String role; // owner | member
  final String email;
  final String? displayName;

  const HouseholdMember({required this.userId, required this.role, required this.email, this.displayName});

  factory HouseholdMember.fromJson(Map<String, dynamic> j) => HouseholdMember(
        userId: j['user_id'] as String,
        role: (j['role'] ?? 'member') as String,
        email: (j['email'] ?? '') as String,
        displayName: j['display_name'] as String?,
      );
}

class HouseholdInvite {
  final String id;
  final String? inviteeEmail;
  final DateTime expiresAt;

  const HouseholdInvite({required this.id, this.inviteeEmail, required this.expiresAt});

  factory HouseholdInvite.fromJson(Map<String, dynamic> j) => HouseholdInvite(
        id: j['id'] as String,
        inviteeEmail: j['invitee_email'] as String?,
        expiresAt: DateTime.parse(j['expires_at'] as String),
      );
}

/// A household the user belongs to. `members` and `invites` are only filled by the detail call.
class Household {
  final String id;
  final String name;
  final String role; // owner | member
  final int memberCount;
  final List<HouseholdMember> members;
  final List<HouseholdInvite> invites;

  const Household({
    required this.id,
    required this.name,
    required this.role,
    this.memberCount = 0,
    this.members = const [],
    this.invites = const [],
  });

  bool get isOwner => role == 'owner';

  factory Household.fromJson(Map<String, dynamic> j) => Household(
        id: j['id'] as String,
        name: (j['name'] ?? 'Household') as String,
        role: (j['role'] ?? 'member') as String,
        memberCount: (j['member_count'] as num?)?.toInt() ?? (j['members'] as List?)?.length ?? 0,
        members: [
          for (final m in (j['members'] as List<dynamic>? ?? const []))
            HouseholdMember.fromJson(m as Map<String, dynamic>),
        ],
        invites: [
          for (final i in (j['invites'] as List<dynamic>? ?? const []))
            HouseholdInvite.fromJson(i as Map<String, dynamic>),
        ],
      );
}

/// Notification preferences (GET/PATCH /api/notifications/preferences).
class NotificationPrefs {
  final bool globalEnabled;
  final bool quietHoursEnabled;
  final String quietHoursStart;
  final String quietHoursEnd;
  final bool digestMode;
  final int cooldownHours;
  final bool householdActivityEnabled;
  final bool immediateHighValueEnabled;
  final bool alcoholAlertsEnabled;

  const NotificationPrefs({
    this.globalEnabled = true,
    this.quietHoursEnabled = false,
    this.quietHoursStart = '22:00',
    this.quietHoursEnd = '07:00',
    this.digestMode = false,
    this.cooldownHours = 24,
    this.householdActivityEnabled = true,
    this.immediateHighValueEnabled = true,
    this.alcoholAlertsEnabled = true,
  });

  factory NotificationPrefs.fromJson(Map<String, dynamic> j) => NotificationPrefs(
        globalEnabled: j['global_enabled'] as bool? ?? true,
        quietHoursEnabled: j['quiet_hours_enabled'] as bool? ?? false,
        quietHoursStart: (j['quiet_hours_start'] ?? '22:00') as String,
        quietHoursEnd: (j['quiet_hours_end'] ?? '07:00') as String,
        digestMode: j['digest_mode'] as bool? ?? false,
        cooldownHours: (j['per_product_cooldown_hours'] as num?)?.toInt() ?? 24,
        householdActivityEnabled: j['household_activity_enabled'] as bool? ?? true,
        immediateHighValueEnabled: j['immediate_high_value_enabled'] as bool? ?? true,
        alcoholAlertsEnabled: j['alcohol_alerts_enabled'] as bool? ?? true,
      );
}
