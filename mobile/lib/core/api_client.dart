import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'token_store.dart';

/// API base URL override. In demo mode no backend is contacted at all.
const String kDefaultApiBase = 'http://localhost:3000';
const String kApiBasePrefKey = 'ss.api_base';
const String kDemoModePrefKey = 'ss.demo_mode';
const String kTokenPrefKey = 'ss.token';

enum ApiMode { demo, live }

/// JSON body of an API response: { success, data, error? }
class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, [this.statusCode = 0]);

  @override
  String toString() => message;
}

/// Thin HTTP client for the ShelfSignal API with JWT attach + refresh-free
/// session handling. All responses use the { success, data } envelope.
class ApiClient {
  ApiClient({http.Client? client, this.mode = ApiMode.demo, TokenStore? tokenStore})
      : _client = client ?? http.Client(),
        _tokens = tokenStore ?? SecureTokenStore();

  final TokenStore _tokens;

  final http.Client _client;
  ApiMode mode;
  String? _token;
  String _base = kDefaultApiBase;

  String get baseUrl {
    if (mode == ApiMode.demo) return _base;
    return _base;
  }

  bool get isDemo => mode == ApiMode.demo;

  Future<void> loadPersisted() async {
    final prefs = await SharedPreferences.getInstance();
    _base = prefs.getString(kApiBaseKeyAlias) ?? kDefaultApiBase;
    _token = await _loadToken(prefs);
    final demo = prefs.getBool(kDemoModePrefKey) ?? true;
    mode = demo ? ApiMode.demo : ApiMode.live;
  }

  /// Reads the token from secure storage. A token left in plain preferences by
  /// an older build is migrated across and then removed from preferences.
  Future<String?> _loadToken(SharedPreferences prefs) async {
    String? secure;
    try {
      secure = await _tokens.read();
    } catch (_) {
      secure = null; // secure storage unavailable: behave as signed out
    }
    final legacy = prefs.getString(kTokenPrefKey);
    if (legacy != null) {
      try {
        if (secure == null) {
          await _tokens.write(legacy);
          secure = legacy;
        }
      } catch (_) {
        // keep the legacy token for this launch only
        secure ??= legacy;
      }
      await prefs.remove(kTokenPrefKey);
    }
    return secure;
  }

  Future<void> persistMode() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kDemoModePrefKey, mode == ApiMode.demo);
    await prefs.setString(kApiBaseKeyAlias, _base);
  }

  Future<void> setBaseUrl(String url) async {
    _base = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
    await persistMode();
  }

  Future<void> setToken(String? token) async {
    _token = token;
    try {
      if (token == null) {
        await _tokens.clear();
      } else {
        await _tokens.write(token);
      }
    } catch (_) {
      // Secure storage unavailable: the session stays in memory only.
    }
  }

  String? get token => _token;

  Future<Map<String, dynamic>> _send(
    String method,
    String path,
    Map<String, dynamic>? body, {
    bool auth = true,
  }) async {
    if (mode == ApiMode.demo) {
      throw ApiException('Demo mode: no backend configured');
    }
    final uri = Uri.parse('$_base$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (auth && _token != null) 'Authorization': 'Bearer $_token',
    };
    late http.Response res;
    switch (method) {
      case 'POST':
        res = await _client
            .post(uri, headers: headers, body: jsonEncode(body ?? {}))
            .timeout(const Duration(seconds: 15));
        break;
      case 'PATCH':
        res = await _client
            .patch(uri, headers: headers, body: jsonEncode(body ?? {}))
            .timeout(const Duration(seconds: 15));
        break;
      case 'DELETE':
        res = await _client.delete(uri, headers: headers).timeout(const Duration(seconds: 15));
        break;
      default:
        res = await _client.get(uri, headers: headers).timeout(const Duration(seconds: 15));
    }
    final decoded = jsonDecode(res.body.isEmpty ? '{}' : res.body)
        as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      final err = decoded['error'] as Map<String, dynamic>?;
      throw ApiException(
        (err?['message'] as String?) ?? 'Request failed (${res.statusCode})',
        res.statusCode,
      );
    }
    return decoded;
  }

  Future<Map<String, dynamic>?> get(String path, {bool auth = true}) async {
    if (mode == ApiMode.demo) return null;
    final body = await _send('GET', path, null, auth: auth);
    return body['data'] as Map<String, dynamic>?;
  }

  Future<List<dynamic>> getList(String path, {bool auth = true}) async {
    if (mode == ApiMode.demo) return const [];
    final body = await _send('GET', path, null, auth: auth);
    return (body['data'] as List<dynamic>? ?? const []);
  }

  Future<Map<String, dynamic>?> post(
    String path,
    Map<String, dynamic> body, {
    bool auth = true,
  }) async {
    if (mode == ApiMode.demo) return null;
    final resp = await _send('POST', path, body, auth: auth);
    return resp['data'] as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> patch(
    String path,
    Map<String, dynamic> body, {
    bool auth = true,
  }) async {
    if (mode == ApiMode.demo) return null;
    final resp = await _send('PATCH', path, body, auth: auth);
    return resp['data'] as Map<String, dynamic>?;
  }

  Future<void> delete(String path, {bool auth = true}) async {
    if (mode == ApiMode.demo) return;
    await _send('DELETE', path, null, auth: auth);
  }

  /// Raw POST used by auth (needs the full envelope for the token).
  Future<Map<String, dynamic>> postRaw(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _send('POST', path, body, auth: false);
  }
}

const String kApiBaseKeyAlias = kApiBasePrefKey;

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
