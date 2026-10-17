import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';

import 'core/api.dart';
import 'core/home.dart';
import 'core/session.dart';
import 'design/tokens.dart';
import 'modules/sign_in.dart';

/// Where the server is. Baked in at build time — there is no setting inside
/// the app to correct it, so the build command is the decision.
///
///   flutter build apk --dart-define=NN_BASE_URL=https://erp.example
///
/// **A release build that was given no address uses production**, not a
/// loopback. It used to default to `10.0.2.2:3210` — a development machine as
/// an *emulator* sees it, which is nothing at all on a real handset — and a
/// release APK built without the flag went out and reached nothing. The screen
/// said so ("built to use http://10.0.2.2:3210") and that is how it was found,
/// but an app that cannot work should never have been buildable by forgetting
/// one flag.
///
/// A debug build still defaults to the emulator's view of this machine, which
/// is what a developer running `flutter run` wants.
const _configured = String.fromEnvironment('NN_BASE_URL');

/// The production host: nginx terminates TLS for it and proxies to the app.
const productionBaseUrl = 'https://nninfra.zapeat.in';

/// What an emulator sees of the machine it is running on.
const emulatorBaseUrl = 'http://10.0.2.2:3210';

String get baseUrl =>
    _configured.isNotEmpty ? _configured : (kReleaseMode ? productionBaseUrl : emulatorBaseUrl);

void main() => runApp(const NnInfra());

class NnInfra extends StatefulWidget {
  const NnInfra({super.key});

  @override
  State<NnInfra> createState() => _NnInfraState();
}

class _NnInfraState extends State<NnInfra> {
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
    final s = await _auth.resume();
    if (!mounted) return;
    setState(() {
      _session = s;
      _resuming = false;
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'NN Infra',
        debugShowCheckedModeBanner: false,
        theme: T.theme,
        home: _resuming
            ? const _Splash()
            : _session == null
                ? SignInScreen(auth: _auth, onSignedIn: (s) => setState(() => _session = s))
                : Home(
                    api: _api,
                    auth: _auth,
                    session: _session!,
                    onSignOut: () => setState(() => _session = null),
                  ),
      );
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: T.navy950,
        body: Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [T.brand500, T.navy800],
                ),
              ),
              child: const Icon(Icons.home_work_rounded, color: Colors.white, size: 29),
            ),
            const SizedBox(height: 16),
            Text('NN Infra', style: T.display(color: Colors.white)),
          ]),
        ),
      );
}
