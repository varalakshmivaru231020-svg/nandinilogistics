import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/nav.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// A record, with its children and its actions.
///
/// The app used to build a detail screen from the list row, so a task had no
/// collection, an advance had no decision, and there was nothing to press. These
/// check that what the server sends is what appears, and — the part that was
/// missing entirely — that a **row's own** action runs.

Map<String, Object> taskRecord({
  List<Map<String, dynamic>> points = const [],
  List<Map<String, dynamic>> actions = const [],
}) =>
    {
      '/record/tasks/t1': {
        'key': 'tasks',
        'id': 't1',
        'title': 'Rider onboarding — NL012',
        'subtitle': 'T-9301 · Zomato',
        'pills': [
          {'label': 'Under review L1', 'tone': 'warn'},
          {'label': 'HIGH', 'tone': 'bad'},
        ],
        'sections': [
          {
            'label': 'The task',
            'fields': [
              {'label': 'Task no.', 'value': 'T-9301'},
              {'label': 'Given to', 'value': 'Ravi Shankar'},
              {'label': 'Due', 'value': '2026-10-20T10:00:00.000Z', 'format': 'datetime'},
              {'label': 'Nothing here', 'value': null},
              {'label': 'What is wanted', 'value': 'Collect the documents.', 'wide': true},
            ],
          },
        ],
        'collections': [
          {
            'key': 'advances:c1',
            'label': 'Advance requests · 1 of 2 decided',
            'rows': points,
            'emptyMessage': 'No advance requests.',
          },
        ],
        'actions': actions,
        'serverTime': '2026-10-14T06:00:00.000Z',
      },
    };

Map<String, dynamic> point({
  required String id,
  required String title,
  String? pill,
  String tone = 'warn',
  List<Map<String, dynamic>> actions = const [],
  String trailing = '01',
}) =>
    {
      'id': id,
      'title': title,
      'trailing': trailing,
      'pills': pill == null ? [] : [{'label': pill, 'tone': tone}],
      'actions': actions,
    };

Future<Boundary> pumpRecord(WidgetTester tester, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: RecordScreen(api: b.api, module: 'tasks', id: 't1'),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('a record shows what the server sent', () {
    testWidgets('its heading, its pills and its fields', (tester) async {
      await pumpRecord(tester, taskRecord(points: [point(id: 'p1', title: 'Aadhaar verified')]));

      expect(find.text('Rider onboarding — NL012'), findsOneWidget);
      expect(find.text('T-9301 · Zomato'), findsOneWidget);
      expect(find.text('Under review L1'), findsOneWidget);
      expect(find.text('Ravi Shankar'), findsOneWidget);
      // A date is shown as a date and a time, not as an ISO string.
      expect(find.textContaining('20 Oct 2026'), findsOneWidget);
      expect(find.textContaining('2026-10-20T'), findsNothing);
      // A long value gets a line of its own.
      expect(find.text('Collect the documents.'), findsOneWidget);
    });

    /// A field with nothing in it is left out rather than shown as a blank row.
    testWidgets('leaves an empty field out', (tester) async {
      await pumpRecord(tester, taskRecord(points: const []));
      expect(find.text('Nothing here'), findsNothing);
    });

    /*
     * The collection. This is what the report was about: the task's status says
     * "Under Review" and tells a reviewer nothing; the points say which one is
     * standing in front of whom.
     */
    testWidgets('its children, with who holds each one', (tester) async {
      await pumpRecord(tester, taskRecord(points: [
        point(id: 'p1', title: 'Aadhaar verified', pill: 'Approved', tone: 'good'),
        point(
          id: 'p2',
          title: 'Meter readings recorded',
          pill: 'Review L1 · Anil Deshpande',
          trailing: '02',
        ),
      ]));

      expect(find.text('ADVANCE REQUESTS · 1 OF 2 DECIDED'), findsOneWidget);
      expect(find.text('Aadhaar verified'), findsOneWidget);
      expect(find.text('Review L1 · Anil Deshpande'), findsOneWidget);
      expect(find.text('02'), findsOneWidget);
    });

    testWidgets('says so when a collection is empty', (tester) async {
      await pumpRecord(tester, taskRecord(points: const []));
      expect(find.text('No advance requests.'), findsOneWidget);
    });
  });

  group('a row carries its own action', () {
    /*
     * The thing that was missing. A collection item is decided on its own
     * — there is no decision on the whole task — so the buttons are
     * on the point, and only on the one this person holds.
     */
    testWidgets('approving a point calls the server\'s action for that point',
        (tester) async {
      final b = await pumpRecord(tester, {
        ...taskRecord(points: [
          point(id: 'p1', title: 'Aadhaar verified', pill: 'Approved', tone: 'good'),
          point(id: 'p2', title: 'Meter readings recorded', pill: 'Review L1', actions: [
            {
              'key': 'pass', 'label': 'Approve', 'emphasis': 'approve',
              'action': 'advances/decideAdvance', 'args': ['p2', 'PASS'],
              'remark': 'optional', 'confirm': 'This point moves to the next step.',
            },
            {
              'key': 'fail', 'label': 'Deny', 'emphasis': 'reject',
              'action': 'advances/decideAdvance', 'args': ['p2', 'FAIL'],
              'remark': 'required', 'remarkLabel': 'What is wrong',
              'confirm': 'This point alone goes back to reviewer 1.',
            },
          ]),
        ]),
        '/do/advances/decideAdvance': const {'ok': true},
      });

      // Only the point they hold has buttons.
      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Deny'), findsOneWidget);

      await tester.tap(find.text('Approve'));
      await tester.pumpAndSettle();
      expect(find.textContaining('moves to the next step'), findsOneWidget);

      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(b.actions, hasLength(1));
      expect(b.actions.single.action, 'advances/decideAdvance');
      // The point's id, the decision, then the remark the sheet collected.
      expect(b.actions.single.args, ['p2', 'PASS', '']);
    });

    testWidgets('denying a point insists on a reason', (tester) async {
      final b = await pumpRecord(tester, {
        ...taskRecord(points: [
          point(id: 'p2', title: 'Meter readings', pill: 'Review L1', actions: [
            {
              'key': 'fail', 'label': 'Deny', 'emphasis': 'reject',
              'action': 'advances/decideAdvance', 'args': ['p2', 'FAIL'],
              'remark': 'required', 'remarkLabel': 'What is wrong',
            },
          ]),
        ]),
        '/do/advances/decideAdvance': const {'ok': true},
      });

      await tester.tap(find.text('Deny'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();
      expect(find.text('A remark is required for this.'), findsOneWidget);
      expect(b.actions, isEmpty);

      await tester.enterText(find.byKey(const Key('remark')), 'Readings not taken.');
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();
      expect(b.actions.single.args, ['p2', 'FAIL', 'Readings not taken.']);
    });
  });

  group('the record\'s own actions', () {
    testWidgets('the first is on the bar, the rest behind More', (tester) async {
      await pumpRecord(tester, taskRecord(points: const [], actions: [
        {'key': 'close', 'label': 'Close', 'emphasis': 'approve',
         'action': 'tasks/closeTask', 'args': ['t1'], 'remark': 'required'},
        {'key': 'sendBack', 'label': 'Send back', 'emphasis': 'reject',
         'action': 'tasks/sendBackTask', 'args': ['t1'], 'remark': 'required'},
        {'key': 'comment', 'label': 'Comment', 'emphasis': 'outline',
         'action': 'tasks/addComment', 'args': ['t1'], 'remark': 'required'},
      ]));

      // One primary action, as the design insists.
      expect(find.text('Close'), findsOneWidget);
      expect(find.text('More'), findsOneWidget);
      expect(find.text('Send back'), findsNothing);

      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      expect(find.text('Send back'), findsOneWidget);
      expect(find.text('Comment'), findsOneWidget);
    });

    testWidgets('no bar at all when there is nothing to do', (tester) async {
      await pumpRecord(tester, taskRecord(points: const [], actions: const []));
      expect(find.text('More'), findsNothing);
    });
  });

  group('an action that needs more than a remark', () {
    /*
     * Extending a task needs a new finish as well as a reason, and
     * the web asks for both in one dialog. The server sends the field to ask
     * for and a `$newEndAt` in the arguments; the sheet collects it and puts
     * it where the placeholder was. Before this, Extend on the phone said the
     * date picker for it was "next".
     */
    testWidgets('collects the field the server asked for and sends it',
        (tester) async {
      final b = await pumpRecord(tester, {
        ...taskRecord(points: const [], actions: [
          {
            'key': 'extend', 'label': 'Extend', 'emphasis': 'outline',
            'action': 'tasks/extendTask',
            'args': ['t1', r'$newEndAt'],
            'remark': 'required', 'remarkLabel': 'Why',
            'fields': [
              {
                'name': 'newEndAt', 'label': 'New finish', 'kind': 'date',
                'required': true, 'hint': 'It has to be later than it ends now.',
              },
            ],
            'confirm': 'The first move keeps the original finish.',
          },
        ]),
        '/do/tasks/extendTask': const {'extendedCount': 1},
      });

      await tester.tap(find.text('Extend'));
      await tester.pumpAndSettle();
      expect(find.text('New finish *'), findsOneWidget);
      expect(find.text('It has to be later than it ends now.'), findsOneWidget);

      // The field is required, so the sheet will not send without it.
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();
      expect(find.text('New finish is required.'), findsOneWidget);
      expect(b.actions, isEmpty);

      await tester.tap(find.text('Pick a date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('remark')), 'Consultant comes later.');
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      final args = b.actions.single.args;
      expect(args.first, 't1');
      // The placeholder is gone, replaced by the day that was picked.
      expect(args[1], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(args[2], 'Consultant comes later.');
    });

    /// A box left empty goes as an empty string, which is what a form sends —
    /// the boundary turns it into nothing where the action takes nothing.
    testWidgets('sends an empty box as an empty string', (tester) async {
      final b = await pumpRecord(tester, {
        ...taskRecord(points: const [], actions: [
          {
            'key': 'logFollowUp', 'label': 'Log follow-up', 'emphasis': 'primary',
            'action': 'sales/leads/logFollowUp',
            'args': ['t1', r'$channel', r'$notes', r'$outcome', r'$nextActionAt'],
            'remark': 'none',
            'fields': [
              {
                'name': 'channel', 'label': 'Channel', 'kind': 'select', 'required': true,
                'initial': 'CALL',
                'options': [
                  {'value': 'CALL', 'label': 'Call'},
                  {'value': 'EMAIL', 'label': 'Email'},
                ],
              },
              {'name': 'notes', 'label': 'What happened', 'kind': 'textarea', 'required': true},
              {'name': 'outcome', 'label': 'Outcome', 'kind': 'text'},
              {'name': 'nextActionAt', 'label': 'Next action on', 'kind': 'date'},
            ],
          },
        ]),
        '/do/sales/leads/logFollowUp': const {'ok': true},
      });

      await tester.tap(find.text('Log follow-up'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('field-notes')), 'Rang twice, no answer.');
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(b.actions.single.args, ['t1', 'CALL', 'Rang twice, no answer.', '', '']);
    });
  });

  group('a list of ids', () {
    /*
     * An action that takes a list takes the empty one. It used to send nothing
     * at all, which the boundary reads as a missing argument — "`includeOptional`
     * is required" — on a cost sheet with no optional charges ticked.
     */
    testWidgets('an empty picker is sent as an empty list', (tester) async {
      final b = await pumpRecord(tester, {
        ...taskRecord(points: const [], actions: [
          {
            'key': 'costSheet', 'label': 'Generate a cost sheet', 'emphasis': 'primary',
            'action': 'sales/cost-sheets/createCostSheet',
            'args': ['u1', r'$leadId', r'$includeOptional', r'$discountAmount'],
            'remark': 'none',
            'fields': [
              {
                'name': 'leadId', 'label': 'Lead', 'kind': 'lookup',
                'emptyLabel': '— None —',
                'options': [{'value': 'l1', 'label': 'Rajesh Iyer'}],
              },
              {
                'name': 'includeOptional', 'label': 'Optional charges', 'kind': 'multi',
                'options': [{'value': 'CLUB', 'label': 'Club membership'}],
              },
              {'name': 'discountAmount', 'label': 'Discount', 'kind': 'money'},
            ],
          },
        ]),
        '/do/sales/cost-sheets/createCostSheet': const {'id': 'cs1'},
      });

      await tester.tap(find.text('Generate a cost sheet'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(b.actions.single.args, ['u1', '', <String>[], '']);
    });
  });

  group('a module whose record screen is not built', () {
    /// Said plainly, rather than an empty screen or a raw error.
    testWidgets('says the list works and the record is coming', (tester) async {
      useEmptyPrefs();
      final b = Boundary({
        '/record/material/vendors/v1':
            const Fail(404, 'There is no record screen for that yet: material/vendors', 'unknown-record'),
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(api: b.api, module: 'material/vendors', id: 'v1'),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('no record screen for that yet'), findsOneWidget);
      expect(find.textContaining('list and its filters work'), findsOneWidget);
      // Nothing to retry — it is not a failure.
      expect(find.text('Try again'), findsNothing);
    });
  });

  group('a web link names the record behind it', () {
    /*
     * This is what makes a notification tappable: it carries the route the
     * web would open, and that is what names the module
     * and the id.
     */
    test('a lead link', () {
      final t = recordFor('/sales/leads/cmtr7prug000xpp1oac25rzum');
      expect(t?.module, 'sales/leads');
      expect(t?.id, 'cmtr7prug000xpp1oac25rzum');
    });

    test('a task link', () {
      expect(recordFor('/tasks/cmusd9imz0001ppo2vxu2h45l')?.module, 'tasks');
    });

    /// Where the web's route and the record's module are not the same words.
    test('an employee, whose route is just /hr', () {
      final t = recordFor('/hr/cmtvcr51201jypp9cyu8xpya0');
      expect(t?.module, 'hr/employees');
    });

    /// A list route is not a record, and neither is a word like "reports".
    test('and nothing where there is no record', () {
      expect(recordFor('/tasks'), isNull);
      expect(recordFor('/tasks/new'), isNull);
      expect(recordFor('/sales/leads?stage=new'), isNull);
      expect(recordFor(''), isNull);
    });
  });
}
