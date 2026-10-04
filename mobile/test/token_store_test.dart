import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shelfsignal/core/api_client.dart';
import 'package:shelfsignal/core/token_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('setToken stores in the token store, never in shared preferences', () async {
    SharedPreferences.setMockInitialValues({});
    final store = MemoryTokenStore();
    final api = ApiClient(tokenStore: store);

    await api.setToken('jwt-abc');

    expect(await store.read(), 'jwt-abc');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(kTokenPrefKey), isNull);
    expect(api.token, 'jwt-abc');

    await api.setToken(null);
    expect(await store.read(), isNull);
  });

  test('a legacy plain-preferences token is migrated and removed', () async {
    SharedPreferences.setMockInitialValues({kTokenPrefKey: 'legacy-jwt'});
    final store = MemoryTokenStore();
    final api = ApiClient(tokenStore: store);

    await api.loadPersisted();

    expect(api.token, 'legacy-jwt');
    expect(await store.read(), 'legacy-jwt');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(kTokenPrefKey), isNull);
  });

  test('the secure store wins over a stale legacy value', () async {
    SharedPreferences.setMockInitialValues({kTokenPrefKey: 'old'});
    final store = MemoryTokenStore();
    await store.write('new');
    final api = ApiClient(tokenStore: store);

    await api.loadPersisted();

    expect(api.token, 'new');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(kTokenPrefKey), isNull);
  });
}
