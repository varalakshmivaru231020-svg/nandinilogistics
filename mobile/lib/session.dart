import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Who is signed in, and what they may do.
///
/// The one rule this file exists to enforce: **never test the permission set
/// directly.** A super admin's set is whatever their roles resolve to — the
/// seeded Owner arrives with 560 codes, one created with no role arrives with
/// none and may still do everything. `can()` is the only check.
class Session {
  Session({
    required this.token,
    required this.id,
    required this.name,
    required this.email,
    required this.isSuperAdmin,
    required this.permissions,
    required this.projects,
    this.projectId,
  });

  final String token;
  final String id;
  final String name;
  final String email;
  final bool isSuperAdmin;
  final Set<String> permissions;
  final List<Project> projects;
  final String? projectId;

  /// The only permission check in the app.
  bool can(String code) => isSuperAdmin || permissions.contains(code);

  bool canAny(Iterable<String> codes) => codes.any(can);

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  Session withProject(String? id) => Session(
        token: token,
        id: this.id,
        name: name,
        email: email,
        isSuperAdmin: isSuperAdmin,
        permissions: permissions,
        projects: projects,
        projectId: id,
      );

  static Session fromPayload(String token, Map<String, dynamic> user, List<dynamic> projects) =>
      Session(
        token: token,
        id: user['id'] as String,
        name: user['name'] as String,
        email: user['email'] as String,
        isSuperAdmin: user['isSuperAdmin'] as bool? ?? false,
        permissions: ((user['permissions'] as List?) ?? const [])
            .map((e) => e as String)
            .toSet(),
        projects: projects
            .map((p) => Project(
                  id: (p as Map)['id'] as String,
                  code: p['code'] as String,
                  name: p['name'] as String,
                ))
            .toList(),
        projectId: user['workspaceProjectId'] as String?,
      );
}

class Project {
  const Project({required this.id, required this.code, required this.name});
  final String id;
  final String code;
  final String name;
  String get label => '$code — $name';
}

/// The token, kept across launches. Nothing else is cached: the permission set
/// is re-read from /me on every start, which is how a permission taken away
/// this morning reaches a phone that signed in last night.
class SessionStore {
  static const _key = 'nn_token';

  Future<String?> read() async =>
      (await SharedPreferences.getInstance()).getString(_key);

  Future<void> write(String token) async =>
      (await SharedPreferences.getInstance()).setString(_key, token);

  Future<void> clear() async =>
      (await SharedPreferences.getInstance()).remove(_key);
}

/// Signing in, and picking the session back up on a cold start.
class Auth {
  Auth(this.api, {SessionStore? store}) : store = store ?? SessionStore();

  final Api api;
  final SessionStore store;

  /// The three refusals the boundary can answer with, each needing different
  /// words — and none of them a reason to offer the password field again.
  static String refusalFor(ApiResult<dynamic> result) {
    if (result.code == 'admin.mobile.use') {
      return 'This account is not allowed to use the mobile app. You can still sign in on the web.';
    }
    if (result.code == 'inactive') {
      return 'This account is not active. Contact your administrator.';
    }
    return result.error ?? 'That did not work.';
  }

  /// True when the refusal is final — show it and stop, do not re-prompt.
  static bool isFinal(ApiResult<dynamic> result) =>
      result.refused && result.code != 'credentials';

  Future<ApiResult<Session>> signIn(String email, String password, String device) async {
    final res = await api.post('/auth/login', body: {
      'email': email.trim(),
      'password': password,
      'device': device,
    });
    if (!res.ok) return ApiResult.fail(res.status, Auth.refusalFor(res), res.code);

    final token = res.data!['token'] as String;
    api.token = token;
    await store.write(token);

    final me = await api.get('/me');
    if (!me.ok) return ApiResult.fail(me.status, me.error!, me.code);
    return ApiResult.ok(Session.fromPayload(
      token,
      me.data!['user'] as Map<String, dynamic>,
      (me.data!['projects'] as List?) ?? const [],
    ));
  }

  /// A stored token, checked against the server. Null when there is none or it
  /// is no longer good — a revoked device lands here on its next start.
  Future<Session?> resume() async {
    final token = await store.read();
    if (token == null) return null;
    api.token = token;

    final me = await api.get('/me');
    if (!me.ok) {
      if (me.needsSignIn) await store.clear();
      return null;
    }
    return Session.fromPayload(
      token,
      me.data!['user'] as Map<String, dynamic>,
      (me.data!['projects'] as List?) ?? const [],
    );
  }

  Future<void> signOut() async {
    await api.post('/auth/logout');
    api.token = null;
    await store.clear();
  }
}

/// Decodes nothing sensitive — only used by tests to read a token's claims.
Map<String, dynamic> peekClaims(String jwt) {
  final parts = jwt.split('.');
  if (parts.length != 3) return const {};
  var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  payload = payload.padRight(payload.length + (4 - payload.length % 4) % 4, '=');
  return jsonDecode(utf8.decode(base64.decode(payload))) as Map<String, dynamic>;
}
