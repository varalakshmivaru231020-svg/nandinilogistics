import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/session.dart';
import 'package:nninfra/core/where.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/dashboard.dart';
import 'package:nninfra/modules/punch.dart';
import 'package:nninfra/modules/sign_in.dart';
import 'package:nninfra/modules/sign_up.dart';

import 'support.dart';

/// The rider app (SOW §3.6–3.8): PIN sign-in, self sign-up, the home tiles
/// each role gets, and punching in and out.

const _me = {
  'user': {
    'id': 'u9',
    'name': 'Suresh Kumar',
    'email': 'rider@nandini.example',
    'isSuperAdmin': false,
    'roles': [
      {'name': 'Rider'}
    ],
    'permissions': ['hr.attendance.punch', 'hr.employee.idCard'],
  },
  'rider': {
    'id': 'e9',
    'riderId': 'NL009',
    'name': 'Suresh Kumar',
    'mobile': '9876543210',
    'onboardingStatus': 'SUBMITTED',
    'companies': [
      {'id': 'c1', 'name': 'Zomato'}
    ],
    'referralCode': 'NL009',
  },
  'serverTime': '2026-10-26T06:00:00.000Z',
};

class _FakeWhere implements Where {
  _FakeWhere({this.at, this.why});
  final ({double lat, double lng})? at;
  final String? why;

  @override
  String? problem;

  @override
  Future<({double lat, double lng})?> position() async {
    problem = why;
    return at;
  }
}

Session _rider(List<String> codes, {String status = 'ACCEPTED', String? reason}) => Session(
      token: 't',
      id: 'u9',
      name: 'Suresh Kumar',
      email: 'rider@nandini.example',
      isSuperAdmin: false,
      permissions: codes.toSet(),
      roleNames: const ['Rider'],
      rider: RiderProfile(
        id: 'e9',
        riderId: 'NL009',
        name: 'Suresh Kumar',
        onboardingStatus: status,
        rejectionReason: reason,
        referralCode: 'NL009',
      ),
    );

Future<void> _pumpHome(WidgetTester tester, Boundary b, Session s) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: DashboardScreen(
      api: b.api,
      session: s,
      onMenu: () {},
      onNotifications: () {},
      onOpen: (_, _) {},
      bottom: const SizedBox.shrink(),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUp(useEmptyPrefs);

  group('signing in with a mobile number and PIN', () {
    Future<(Boundary, List<Session>)> pump(WidgetTester tester, Map<String, Object> routes) async {
      final b = Boundary(routes);
      final signedIn = <Session>[];
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: SignInScreen(auth: Auth(b.api), onSignedIn: signedIn.add),
      ));
      await tester.pumpAndSettle();
      return (b, signedIn);
    }

    testWidgets('is the default, and signs a rider in', (tester) async {
      final (b, signedIn) = await pump(tester, {
        '/auth/pin-login': const {'token': 'tok', 'expiresAt': '2026-12-01', 'user': {}},
        '/me': _me,
      });
      expect(find.byKey(const Key('pin')), findsOneWidget);
      expect(find.byKey(const Key('password')), findsNothing);

      await tester.enterText(find.byKey(const Key('mobile')), '9876543210');
      // Letters and a fifth digit are refused by the field itself.
      await tester.enterText(find.byKey(const Key('pin')), '12a345');
      await tester.tap(find.byKey(const Key('submit')));
      // Not settled: the button keeps turning, since the app swaps the screen.
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      final login = b.calls.firstWhere((c) => c.path == '/auth/pin-login');
      expect(login.body, {'mobile': '9876543210', 'pin': '1234', 'device': 'Android'});
      expect(signedIn.single.rider?.riderId, 'NL009');
    });

    testWidgets('says so when the PIN is wrong', (tester) async {
      await pump(tester, {
        '/auth/pin-login': const Fail(401, 'Invalid credentials', 'credentials'),
      });
      await tester.enterText(find.byKey(const Key('mobile')), '9876543210');
      await tester.enterText(find.byKey(const Key('pin')), '0000');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      expect(find.text('That mobile number and PIN do not match.'), findsOneWidget);
      // Still there to try again.
      expect(find.byKey(const Key('pin')), findsOneWidget);
    });

    testWidgets('an older server says the feature is not there yet', (tester) async {
      await pump(tester, {});
      await tester.enterText(find.byKey(const Key('mobile')), '9876543210');
      await tester.enterText(find.byKey(const Key('pin')), '1234');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      expect(find.text(notOnServer), findsOneWidget);
    });

    testWidgets('Forgot PIN shows the server\'s message', (tester) async {
      final (b, _) = await pump(tester, {
        '/auth/forgot-pin': const {'message': 'Your tele-caller will reset your PIN.'},
      });
      await tester.enterText(find.byKey(const Key('mobile')), '9876543210');
      await tester.tap(find.byKey(const Key('forgot-pin')));
      await tester.pumpAndSettle();
      expect(find.text('Your tele-caller will reset your PIN.'), findsOneWidget);
      expect(b.calls.last.body, {'mobile': '9876543210'});
    });

    testWidgets('staff can switch to email and password', (tester) async {
      await pump(tester, {});
      await tester.tap(find.byKey(const Key('mode-email')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('email')), findsOneWidget);
      expect(find.byKey(const Key('password')), findsOneWidget);
      expect(find.byKey(const Key('forgot-pin')), findsNothing);
    });
  });

  group('signing up', () {
    test('the checks catch what the server would refuse', () {
      final p = signUpProblems({
        'mobile': '12345',
        'name': 'S',
        'address': '',
        'emergencyMobileFamily': '9876543210',
        'emergencyMobileFriend': '9876543211',
        'aadhaar': '1234 5678 901',
        'pan': 'ABCD1234F',
        'pin': '1234',
        'confirmPin': '1235',
      }, const {'photo'});
      expect(p.keys, containsAll(['mobile', 'name', 'address', 'aadhaar', 'pan', 'confirmPin',
          'doc:Aadhaar front', 'doc:Aadhaar back']));
      expect(p.containsKey('photo'), isFalse);
      expect(p.containsKey('emergencyMobileFamily'), isFalse);

      final ok = signUpProblems({
        'mobile': '9876543210',
        'name': 'Suresh',
        'address': 'Koramangala',
        'emergencyMobileFamily': '9876543211',
        'emergencyMobileFriend': '9876543212',
        'aadhaar': '1234 5678 9012',
        'pan': 'abcde1234f',
        'pin': '1234',
        'confirmPin': '1234',
      }, const {'photo', 'doc:Aadhaar front', 'doc:Aadhaar back'});
      expect(ok, isEmpty);
    });

    testWidgets('an empty form is not sent, and says what is missing', (tester) async {
      tester.view.physicalSize = const Size(1080, 6000);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final b = Boundary({});
      await tester.pumpWidget(MaterialApp(theme: T.theme, home: SignUpScreen(auth: Auth(b.api))));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('signup-submit')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('signup-error')), findsOneWidget);
      expect(b.multipart, isEmpty);
      expect(b.calls, isEmpty);
      expect(find.text('Aadhaar is 12 digits.'), findsOneWidget);
    });
  });

  group('home, by permission', () {
    testWidgets('a rider gets the rider tiles their permissions allow', (tester) async {
      final b = Boundary({
        '/list/payouts': const {
          'title': 'Payouts',
          'rows': [
            {
              'id': 'p1', 'totalPayout': 5200, 'advance': 500, 'bikeRental': 700, 'tds': 52,
              'finalPayout': 3948, 'status': 'Paid',
              'periodFrom': '2026-10-13', 'periodTo': '2026-10-19',
            }
          ],
        },
      });
      await _pumpHome(tester, b, _rider(const [
        'hr.employee.idCard',
        'hr.attendance.punch',
        'payout.payout.view',
        'advance.advance.view',
        'advance.advance.create',
      ]));

      for (final id in ['idCard', 'punch', 'advances', 'requestAdvance', 'referFriend',
          'referRider', 'profile', 'notifications']) {
        expect(find.byKey(Key('tile-$id')), findsOneWidget, reason: id);
      }
      // Staff tiles are not a rider's, whatever else they hold.
      for (final id in ['team', 'leads', 'onboarding', 'advanceApprovals', 'tlReport']) {
        expect(find.byKey(Key('tile-$id')), findsNothing, reason: id);
      }
      expect(find.text('Rider ID NL009'), findsOneWidget);
      expect(find.text('₹3,948'), findsOneWidget);
      // Accepted: no banner.
      expect(find.byKey(const Key('onboarding-banner')), findsNothing);
    });

    testWidgets('a rider without a permission does not get its tile', (tester) async {
      await _pumpHome(tester, Boundary({}), _rider(const [], status: 'REJECTED', reason: 'Blurred Aadhaar'));
      expect(find.byKey(const Key('tile-idCard')), findsNothing);
      expect(find.byKey(const Key('tile-punch')), findsNothing);
      expect(find.byKey(const Key('tile-requestAdvance')), findsNothing);
      expect(find.byKey(const Key('payout-card')), findsNothing);
      expect(find.textContaining('Blurred Aadhaar'), findsOneWidget);
      expect(find.textContaining('Contact your tele-caller'), findsOneWidget);
    });

    testWidgets('a Team Leader gets the team tiles', (tester) async {
      await _pumpHome(tester, Boundary({}), sessionWith(const [
        'hr.employee.view',
        'hr.attendance.view',
        'hr.attendance.punch',
        'advance.advance.approve',
        'sales.lead.create',
        'hr.employee.acceptOnboarding',
        'reports.teamLeader.view',
        'task.task.view',
      ]));
      for (final id in ['team', 'attendance', 'punch', 'advanceApprovals', 'newLead',
          'onboarding', 'tlReport', 'tasks']) {
        expect(find.byKey(Key('tile-$id')), findsOneWidget, reason: id);
      }
      expect(find.text('My team'), findsOneWidget);
      expect(find.byKey(const Key('tile-idCard')), findsNothing);
    });
  });

  group('the punch screen', () {
    Future<Boundary> pump(WidgetTester tester, Map<String, Object> routes) async {
      final b = Boundary(routes);
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: PunchScreen(api: b.api, month: '2026-10'),
      ));
      await tester.pumpAndSettle();
      return b;
    }

    Object monthOf(Map<String, Object?>? today) => <String, Object?>{
          'month': '2026-10',
          'today': today,
          'days': [
            {'date': '2026-10-01', 'status': 'PRESENT', 'punchInAt': null, 'punchOutAt': null},
          ],
        };

    testWidgets('not punched in: punching in sends where the phone is', (tester) async {
      Where.live = _FakeWhere(at: (lat: 12.93, lng: 77.62));
      final b = await pump(tester, {
        '/attendance/me': monthOf(null),
        '/do/hr/punchIn': const {'ok': true},
      });
      expect(find.text('Not punched in yet'), findsOneWidget);
      expect(find.byKey(const Key('punch-out')), findsNothing);
      expect(find.text('1 present this month'), findsOneWidget);

      await tester.tap(find.byKey(const Key('punch-in')));
      await tester.pumpAndSettle();
      expect(b.actions.single.action, 'hr/punchIn');
      expect(b.actions.single.args, [12.93, 77.62]);
    });

    testWidgets('punched in: offers punch out', (tester) async {
      await pump(tester, {
        '/attendance/me': monthOf({'punchInAt': '2026-10-26T03:30:00.000Z', 'punchOutAt': null, 'status': 'PRESENT'}),
      });
      expect(find.byKey(const Key('punch-out')), findsOneWidget);
      expect(find.byKey(const Key('punch-in')), findsNothing);
      expect(find.textContaining('Punched in at'), findsOneWidget);
    });

    testWidgets('done for the day: nothing to press', (tester) async {
      await pump(tester, {
        '/attendance/me': monthOf({
          'punchInAt': '2026-10-26T03:30:00.000Z',
          'punchOutAt': '2026-10-26T12:30:00.000Z',
          'status': 'PRESENT',
        }),
      });
      expect(find.textContaining('Done for today'), findsOneWidget);
      expect(find.byKey(const Key('punch-in')), findsNothing);
      expect(find.byKey(const Key('punch-out')), findsNothing);
    });

    testWidgets('location off: says so and sends nothing', (tester) async {
      Where.live = _FakeWhere(why: 'Location is switched off on this phone. Turn it on and try again.');
      final b = await pump(tester, {'/attendance/me': monthOf(null)});
      await tester.tap(find.byKey(const Key('punch-in')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Location is switched off'), findsOneWidget);
      expect(b.actions, isEmpty);
    });

    testWidgets('an older server says it is not there yet', (tester) async {
      await pump(tester, {});
      expect(find.text(notOnServer), findsOneWidget);
    });
  });
}
