import 'package:flutter/material.dart';

import 'api.dart';
import 'session.dart';
import 'screens/home.dart';
import 'screens/sign_in.dart';
import 'theme.dart';

/// Where the server is. Passed in at build time so a debug APK can point at a
/// laptop on the site wifi and a release build at the real thing:
///
///   flutter build apk --dart-define=NN_BASE_URL=https://erp.example
const baseUrl = String.fromEnvironment(
  'NN_BASE_URL',
  defaultValue: 'http://10.0.2.2:3210',
);

void main() => runApp(const NnInfraApp());

class NnInfraApp extends StatefulWidget {
  const NnInfraApp({super.key});

  @override
  State<NnInfraApp> createState() => _NnInfraAppState();
}

class _NnInfraAppState extends State<NnInfraApp> {
  late final Api _api = Api(baseUrl: baseUrl);
  late final Auth _auth = Auth(_api);

  Session? _session;
  bool _resuming = true;

  @override
  void initState() {
    super.initState();
    _resume();
  }

  /// A stored token is checked against the server rather than trusted. This is
  /// how a device revoked overnight, or a permission taken away this morning,
  /// reaches a phone that signed in yesterday.
  Future<void> _resume() async {
    final session = await _auth.resume();
    if (!mounted) return;
    setState(() {
      _session = session;
      _resuming = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NN Infra',
      debugShowCheckedModeBanner: false,
      theme: T.theme,
      home: _resuming
          ? const _Splash()
          : _session == null
              ? SignInScreen(
                  auth: _auth,
                  onSignedIn: (s) => setState(() => _session = s),
                )
              : HomeScreen(
                  api: _api,
                  auth: _auth,
                  session: _session!,
                  onSignOut: () => setState(() => _session = null),
                ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.navy,
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: T.brand, borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.home_work_rounded, color: Colors.white, size: 29),
          ),
          const SizedBox(height: 16),
          Text('NN Infra', style: T.heading(22, color: Colors.white, weight: FontWeight.w800)),
        ]),
      ),
    );
  }
}
