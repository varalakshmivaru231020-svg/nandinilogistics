import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Who is signed in, and what they may do.
///
/// The one rule this file exists to enforce: **never test the permission set
/// directly.** A super admin's set is whatever their roles resolve to — one
/// created with no role arrives empty and may still do everything. `can()` is
/// the only check in the app.
class Session {
  Session({
    required this.token,
    required this.id,
    required this.name,
    required this.email,
    required this.isSuperAdmin,
    required this.permissions,
    required this.roleNames,
    required this.projects,
    this.projectId,
  });

  final String token;
  final String id;
  final String name;
  final String email;
  final bool isSuperAdmin;
  final Set<String> permissions;
  final List<String> roleNames;
  final List<Project> projects;
  final String? projectId;

  bool can(String code) => isSuperAdmin || permissions.contains(code);
  bool canAny(Iterable<String> codes) => codes.any(can);

  /// Any code under a prefix — for a screen gated per record, like reports.
  bool canUnder(String prefix) =>
      isSuperAdmin || permissions.any((c) => c.startsWith(prefix));

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  /// "Owner / Admin · 550 permissions" — what the drawer shows under the name.
  String get standing {
    final roles = roleNames.isEmpty ? (isSuperAdmin ? 'Super admin' : 'No role') : roleNames.join(', ');
    final n = isSuperAdmin && permissions.isEmpty ? 'every' : '${permissions.length}';
    return '$roles · $n permissions';
  }

  Project? get project =>
      projectId == null ? null : projects.where((p) => p.id == projectId).firstOrNull;

  Session withProject(String? id) => Session(
        token: token, id: this.id, name: name, email: email,
        isSuperAdmin: isSuperAdmin, permissions: permissions, roleNames: roleNames,
        projects: projects, projectId: id,
      );

  static Session fromPayload(String token, Map<String, dynamic> user, List<dynamic> projects) =>
      Session(
        token: token,
        id: user['id'] as String,
        name: user['name'] as String,
        email: user['email'] as String,
        isSuperAdmin: user['isSuperAdmin'] as bool? ?? false,
        permissions: ((user['permissions'] as List?) ?? const []).map((e) => e as String).toSet(),
        roleNames: ((user['roles'] as List?) ?? const [])
            .map((r) => (r as Map)['name'] as String)
            .toList(),
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
class Store {
  static const _key = 'nn_token';

  Future<String?> read() async => (await SharedPreferences.getInstance()).getString(_key);
  Future<void> write(String t) async => (await SharedPreferences.getInstance()).setString(_key, t);
  Future<void> clear() async => (await SharedPreferences.getInstance()).remove(_key);
}

class Auth {
  Auth(this.api, {Store? store}) : store = store ?? Store();

  /// Public so a failure can name the address it tried.
  final Api api;
  final Store store;

  static String refusalFor(Res<dynamic> r) {
    if (r.code == 'admin.mobile.use') {
      return 'This account is not allowed to use the mobile app. You can still sign in on the web.';
    }
    if (r.code == 'inactive') return 'This account is not active. Contact your administrator.';
    return r.error ?? 'That did not work.';
  }

  /// A server that was never reached is never final: the password may well be
  /// right, and taking the field away would say the account is barred when the
  /// real problem is the network.
  static bool isFinal(Res<dynamic> r) => r.refused && r.code != 'credentials';

  Future<Res<Session>> signIn(String email, String password, String device) async {
    final res = await api.post('/auth/login', body: {
      'email': email.trim(),
      'password': password,
      'device': device,
    });
    if (!res.ok) return Res.fail(res.status, refusalFor(res), res.code);

    final token = res.data!['token'] as String;
    api.token = token;
    // Keeping the token is a convenience, not part of signing in.
    try {
      await store.write(token);
    } catch (_) {/* costs nothing until the next launch */}

    return _me(token);
  }

  Future<Session?> resume() async {
    final token = await store.read();
    if (token == null) return null;
    api.token = token;
    final s = await _me(token);
    if (!s.ok) {
      if (s.needsSignIn) await store.clear();
      return null;
    }
    return s.data;
  }

  Future<Res<Session>> _me(String token) async {
    final me = await api.get('/me');
    if (!me.ok) return Res.fail(me.status, me.error!, me.code);
    try {
      final s = Session.fromPayload(
        token,
        me.data!['user'] as Map<String, dynamic>,
        (me.data!['projects'] as List?) ?? const [],
      );
      api.projectId = s.projectId;
      return Res.ok(s);
    } catch (_) {
      return Res.fail(
        0,
        'Signed in, but could not read the account. The server may be a '
        'different version from this app.',
        'payload',
      );
    }
  }

  Future<void> signOut() async {
    await api.post('/auth/logout');
    api.token = null;
    await store.clear();
  }
}
