import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/repository.dart';

// ---- Mode ----------------------------------------------------------------
final demoModeProvider = StateProvider<bool>((ref) => true);

// ---- Session -------------------------------------------------------------
class SessionState {
  const SessionState({
    this.email,
    this.isLoading = false,
    this.error,
  });

  final String? email;
  final bool isLoading;
  final String? error;

  bool get isSignedIn => email != null;

  SessionState copyWith({String? email, bool? isLoading, String? error}) {
    return SessionState(
      email: email,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class SessionController extends StateNotifier<SessionState> {
  SessionController(this._repo) : super(const SessionState()) {
    _restore();
  }

  final Repository _repo;

  Future<void> _restore() async {
    final token = await _repo.resolveToken();
    // Demo mode keeps a signed-in session by default so the whole slice works.
    if (_repo.isDemo) {
      state = state.copyWith(email: 'demo@shelfsignal.local');
    } else if (token != null) {
      state = state.copyWith(email: 'saved-session');
    }
  }

  Future<bool> signIn(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repo.login(email, password);
      state = SessionState(email: result.email);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(isLoading: false, error: e.message);
      return false;
    }
  }

  Future<bool> register(String email, String password, String? name) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repo.register(email, password, name);
      state = SessionState(email: result.email);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(isLoading: false, error: e.message);
      return false;
    }
  }

  Future<void> signOut() async {
    await _repo.signOut();
    state = const SessionState();
  }
}

final sessionProvider =
    StateNotifierProvider<SessionController, SessionState>((ref) {
  return SessionController(ref.watch(repositoryProvider));
});

// ---- Watchlist -----------------------------------------------------------
class WatchlistController extends StateNotifier<AsyncValue<List<WatchItem>>> {
  WatchlistController(this._repo) : super(const AsyncValue.loading()) {
    refresh();
  }

  final Repository _repo;

  Future<void> refresh() async {
    try {
      final items = await _repo.listWatchItems();
      state = AsyncValue.data(items);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> watch(SsProduct product) async {
    await _repo.watchProduct(product);
    await refresh();
  }

  Future<void> remove(String id) async {
    await _repo.removeWatchItem(id);
    await refresh();
  }

  Future<void> snooze(String id) async {
    await _repo.snoozeWatchItem(id);
    await refresh();
  }

  Future<void> setRule({
    required String watchItemId,
    required String ruleType,
    double? targetPrice,
    double? minDiscountPercent,
  }) async {
    await _repo.setRule(
      watchItemId: watchItemId,
      ruleType: ruleType,
      targetPrice: targetPrice,
      minDiscountPercent: minDiscountPercent,
    );
    await refresh();
  }
}

final watchlistProvider =
    StateNotifierProvider<WatchlistController, AsyncValue<List<WatchItem>>>(
        (ref) {
  return WatchlistController(ref.watch(repositoryProvider));
});

// ---- Signals -------------------------------------------------------------
class SignalsController extends StateNotifier<AsyncValue<List<Signal>>> {
  SignalsController(this._repo) : super(const AsyncValue.loading()) {
    refresh();
  }

  final Repository _repo;

  Future<void> refresh() async {
    try {
      final signals = await _repo.listSignals();
      state = AsyncValue.data(signals);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> dismiss(String id) async {
    await _repo.dismissSignal(id);
    await refresh();
  }

  Future<void> markBought(String id) async {
    await _repo.markBought(id);
    await refresh();
  }
}

final signalsProvider =
    StateNotifierProvider<SignalsController, AsyncValue<List<Signal>>>((ref) {
  return SignalsController(ref.watch(repositoryProvider));
});
