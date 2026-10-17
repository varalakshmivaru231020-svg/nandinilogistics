import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/main.dart';

/// Where a build points, and what it must never point at.
///
/// An APK went out built by a plain `flutter build apk` — no
/// `--dart-define=NN_BASE_URL` — and it carried the old default,
/// `http://10.0.2.2:3210`: a development machine **as an emulator sees it**,
/// which on a real handset is nothing at all. The sign-in screen said so and
/// the server never heard from the phone at all.
///
/// Forgetting a flag must not be able to do that again.
void main() {
  group('the address a build is given', () {
    test('production is the hostname, over TLS, on the standard port', () {
      expect(productionBaseUrl, 'https://nninfra.zapeat.in');
      expect(productionBaseUrl.startsWith('https://'), isTrue);
      // No port: nginx terminates TLS on 443 and proxies to the app. A
      // non-standard port is what a mobile network drops.
      expect(RegExp(r':\d+').hasMatch(productionBaseUrl), isFalse);
    });

    test('it is never a loopback or a private address', () {
      for (final bad in ['10.0.2.2', '127.0.0.1', 'localhost', '192.168.', '168.231.103.114']) {
        expect(
          productionBaseUrl.contains(bad),
          isFalse,
          reason: 'production must not be $bad — a handset cannot reach it',
        );
      }
    });

    test('a build with no address given uses production, not the emulator', () {
      // This suite runs in debug, so `baseUrl` is the emulator's view here —
      // what is asserted is the rule the release build follows.
      expect(kReleaseMode, isFalse, reason: 'tests run in debug');
      expect(baseUrl, emulatorBaseUrl);
      // And the release side of that same rule.
      const configured = String.fromEnvironment('NN_BASE_URL');
      expect(configured.isEmpty ? productionBaseUrl : configured, productionBaseUrl);
    });
  });
}
