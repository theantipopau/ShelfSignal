import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the session token lives. The token is a bearer credential, so it goes
/// in platform secure storage (Keychain / Android Keystore-backed), not in
/// plain `shared_preferences` (Master Prompt §17 "secure token storage").
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'ss.token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// In-memory store for tests (and as a safe fallback if secure storage is
/// unavailable: the session then lasts until the app is closed rather than
/// leaking into plain preferences).
class MemoryTokenStore implements TokenStore {
  String? _token;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String token) async => _token = token;

  @override
  Future<void> clear() async => _token = null;
}
