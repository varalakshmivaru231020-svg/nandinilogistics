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
    this.rider,
  });

  final String token;
  final String id;
  final String name;
  final String email;
  final bool isSuperAdmin;
  final Set<String> permissions;
  final List<String> roleNames;

  /// The rider this account is, where it is one. Null for staff.
  final RiderProfile? rider;

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

  static Session fromPayload(String token, Map<String, dynamic> user,
          {Map<String, dynamic>? rider}) =>
      Session(
        rider: rider == null ? null : RiderProfile.from(rider),
        token: token,
        id: user['id'] as String,
        name: user['name'] as String,
        email: user['email'] as String,
        isSuperAdmin: user['isSuperAdmin'] as bool? ?? false,
        permissions: ((user['permissions'] as List?) ?? const []).map((e) => e as String).toSet(),
        roleNames: ((user['roles'] as List?) ?? const [])
            .map((r) => (r as Map)['name'] as String)
            .toList(),
      );
}

/// The rider behind a rider's account, as `/me` sends it.
class RiderProfile {
  const RiderProfile({
    required this.id,
    this.riderId,
    required this.name,
    this.mobile,
    this.photoUrl,
    this.onboardingStatus,
    this.rejectionReason,
    this.companies = const [],
    this.referralCode,
    this.insuranceNumber,
    this.emergencyMobileFamily,
    this.joinedOn,
  });

  final String id;
  final String? riderId;
  final String name;
  final String? mobile;
  final String? photoUrl;

  /// DRAFT · SUBMITTED · ACCEPTED · REJECTED.
  final String? onboardingStatus;
  final String? rejectionReason;
  final List<String> companies;
  final String? referralCode;
  final String? insuranceNumber;
  final String? emergencyMobileFamily;
  final String? joinedOn;

  static String? _s(Object? v) => v == null || '$v'.isEmpty ? null : '$v';

  static RiderProfile from(Map<String, dynamic> d) => RiderProfile(
        id: '${d["id"]}',
        riderId: _s(d['riderId']),
        name: '${d["name"] ?? ""}',
        mobile: _s(d['mobile']),
        photoUrl: _s(d['photoUrl']),
        onboardingStatus: _s(d['onboardingStatus']),
        rejectionReason: _s(d['rejectionReason']),
        companies: [
          for (final c in (d['companies'] as List?) ?? const [])
            c is Map ? '${c["name"]}' : '$c',
        ],
        referralCode: _s(d['referralCode']),
        insuranceNumber: _s(d['insuranceNumber']),
        emergencyMobileFamily: _s(d['emergencyMobileFamily']),
        joinedOn: _s(d['joinedOn']),
      );
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
    return _accept(res);
  }

  /// A rider's way in: the mobile number and a four-digit PIN.
  Future<Res<Session>> pinLogin(String mobile, String pin, String device) async {
    final res = await api.post('/auth/pin-login', body: {
      'mobile': mobile.trim(),
      'pin': pin,
      'device': device,
    });
    return _accept(res);
  }

  /// Asks for a PIN reset. The server's own message is what the screen shows.
  Future<Res<String>> forgotPin(String mobile) async {
    final res = await api.post('/auth/forgot-pin', body: {'mobile': mobile.trim()});
    if (res.missing) return const Res.fail(404, notOnServer, 'missing');
    if (!res.ok) return Res.fail(res.status, res.error, res.code);
    return Res.ok('${res.data!['message'] ?? 'Your request has been sent.'}');
  }

  /// Rider self sign-up, which signs in on success exactly as login does.
  Future<Res<Session>> signUp(Map<String, String> fields, List<Upload> files) async {
    final res = await api.multipart('/auth/signup', fields: fields, files: files);
    return _accept(res);
  }

  Future<Res<Session>> _accept(Res<Map<String, dynamic>> res) async {
    if (res.missing) return const Res.fail(404, notOnServer, 'missing');
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

  /// Re-reads /me — the onboarding status moves while the app is open.
  Future<Res<Session>> reload() => _me(api.token ?? '');

  Future<Res<Session>> _me(String token) async {
    final me = await api.get('/me');
    if (!me.ok) return Res.fail(me.status, me.error!, me.code);
    try {
      final s = Session.fromPayload(
        token,
        me.data!['user'] as Map<String, dynamic>,
        rider: me.data!['rider'] as Map<String, dynamic>?,
      );
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
