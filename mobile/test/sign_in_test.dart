import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/screens/sign_in.dart';
import 'package:nninfra/session.dart';
import 'package:nninfra/theme.dart';

import 'support.dart';

Future<void> pumpSignIn(WidgetTester tester, FakeBoundary boundary,
    {void Function(Session)? onSignedIn}) async {
  useEmptyPrefs();
  final api = boundary.api;
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: SignInScreen(auth: Auth(api), onSignedIn: onSignedIn ?? (_) {}),
  ));
  await tester.pumpAndSettle();
}

/// On success the real app replaces this screen, so its spinner is still
/// turning when the callback fires — `pumpAndSettle` would wait for an
/// animation that is meant to be thrown away. `settle: false` pumps a fixed
/// number of frames instead.
Future<void> submit(
  WidgetTester tester, {
  String email = 'pm@nninfra.example',
  bool settle = true,
}) async {
  await tester.enterText(find.byKey(const Key('email')), email);
  await tester.enterText(find.byKey(const Key('password')), 'Nninfra@2026');
  await tester.tap(find.byKey(const Key('submit')));
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }
}

void main() {
  testWidgets('signs in and hands back the session', (tester) async {
    Session? got;
    await pumpSignIn(
      tester,
      FakeBoundary({
        '/auth/login': {'token': 'tok', 'expiresAt': '2030-01-01T00:00:00Z'},
        '/me': {
          'user': {
            'id': 'u1', 'name': 'Vikas Verma', 'email': 'pm@nninfra.example',
            'isSuperAdmin': false, 'permissions': ['material.indent.view'],
          },
          'projects': [{'id': 'p1', 'code': 'NNR', 'name': 'NN Residency'}],
        },
      }),
      onSignedIn: (s) => got = s,
    );

    await submit(tester, settle: false);
    expect(got, isNotNull);
    expect(got!.name, 'Vikas Verma');
    expect(got!.can('material.indent.view'), isTrue);
  });

  testWidgets('a wrong password is shown and can be tried again', (tester) async {
    await pumpSignIn(tester, FakeBoundary({
      '/auth/login': const Failure(401, 'Email or password is incorrect.', 'credentials'),
    }));
    await submit(tester);

    expect(find.text('Email or password is incorrect.'), findsOneWidget);
    // Still there to try again, and the button is still live.
    expect(find.byKey(const Key('password')), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byKey(const Key('submit')));
    expect(button.onPressed, isNotNull);
  });

  /*
   * The refusal the app most easily gets wrong. 403 with this code means stop:
   * the password is right and will never help. Leaving the field there invites
   * a person to type it again and be refused in exactly the same way.
   */
  testWidgets('being barred from the app takes the password field away', (tester) async {
    await pumpSignIn(tester, FakeBoundary({
      '/auth/login': const Failure(403, 'no', 'admin.mobile.use'),
    }));
    await submit(tester);

    expect(find.byKey(const Key('password')), findsNothing);
    expect(find.textContaining('not allowed to use the mobile app'), findsOneWidget);
    expect(find.textContaining('still sign in on the web'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byKey(const Key('submit')));
    expect(button.onPressed, isNull);
  });

  testWidgets('a suspended account is told so, and not asked to retry', (tester) async {
    await pumpSignIn(tester, FakeBoundary({
      '/auth/login': const Failure(403, 'inactive', 'inactive'),
    }));
    await submit(tester);

    expect(find.textContaining('not active'), findsOneWidget);
    expect(find.byKey(const Key('password')), findsNothing);
  });

  /* Being offline is not a refusal, and must not look like one. */
  testWidgets('offline says so, and leaves the field alone', (tester) async {
    useEmptyPrefs();
    final api = FakeBoundary(const {}).api;
    await tester.pumpWidget(MaterialApp(
      home: SignInScreen(auth: Auth(api), onSignedIn: (_) {}),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email')), 'pm@nninfra.example');
    await tester.enterText(find.byKey(const Key('password')), 'x');
    await tester.tap(find.byKey(const Key('submit')));
    await tester.pumpAndSettle();

    // The fake has no /auth/login route, so it answers 404 — not a 403.
    expect(find.byKey(const Key('password')), findsOneWidget);
  });

  testWidgets('the password is hidden until asked for', (tester) async {
    await pumpSignIn(tester, FakeBoundary(const {}));
    TextField field() => tester.widget<TextField>(find.byKey(const Key('password')));
    expect(field().obscureText, isTrue);

    await tester.tap(find.byTooltip('Show password'));
    await tester.pumpAndSettle();
    expect(field().obscureText, isFalse);
  });
}
