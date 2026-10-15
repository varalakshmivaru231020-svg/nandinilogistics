import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/where.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/form_screen.dart';

import 'support.dart';

/// The form shapes the web has and the app had flattened.
///
///  - review and approval **levels**, numbered, in order, with level 1 locked
///    to the assignee and only shown once a checklist is picked;
///  - a **position**, taken from the phone, which the web takes from the
///    browser and posts as two hidden inputs;
///  - a **country code** joined onto a number, which the web joins and drops.

Map<String, Object> _taskForm() => {
      '/form/tasks/create': const {
        'key': 'tasks:create',
        'module': 'tasks',
        'title': 'New task',
        'submit': 'Assign task',
        'submitLabel': 'Assign task',
        'action': 'tasks/createTask',
        'shape': {'kind': 'formData'},
        'fields': [
          {'name': 'title', 'label': 'Title', 'kind': 'text', 'required': true},
          {
            'name': 'assigneeId',
            'label': 'Assign to',
            'kind': 'lookup',
            'required': true,
            'options': [
              {'value': 'u1', 'label': 'Ravi Shankar'},
              {'value': 'u2', 'label': 'Anil Deshpande'},
              {'value': 'u3', 'label': 'Girish Patil'},
            ],
          },
          {
            'name': 'checklistIds',
            'label': 'Checklist',
            'note': 'Optional — it adds review and approval levels',
            'kind': 'multi',
            'options': [
              {'value': 'c1', 'label': 'Column casting QC'},
            ],
          },
          {
            'name': 'reviewerIds',
            'label': 'Reviewers',
            'note': 'They check the work, in order. Level 1 is the person doing it.',
            'kind': 'multi',
            'levels': true,
            'leadWith': 'assigneeId',
            'showWhen': 'checklistIds',
            'placeholder': 'Search people…',
            'options': [
              {'value': 'u1', 'label': 'Ravi Shankar'},
              {'value': 'u2', 'label': 'Anil Deshpande'},
              {'value': 'u3', 'label': 'Girish Patil'},
            ],
          },
          {
            'name': 'approverIds',
            'label': 'Approvers',
            'note': 'They sign it off after the reviews, in order.',
            'kind': 'multi',
            'levels': true,
            'showWhen': 'checklistIds',
            'placeholder': 'Search people…',
            'options': [
              {'value': 'u2', 'label': 'Anil Deshpande'},
              {'value': 'u3', 'label': 'Girish Patil'},
            ],
          },
        ],
      },
      '/do/tasks/createTask': const {'ok': true},
    };

Future<Boundary> _pump(WidgetTester tester, String key, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: FormScreen(api: b.api, formKey: key),
  ));
  await tester.pumpAndSettle();
  return b;
}

/// A phone that knows where it is, and one that will not say.
class _FakeWhere implements Where {
  _FakeWhere(this.at, [this.problem]);
  final ({double lat, double lng})? at;
  @override
  String? problem;
  @override
  Future<({double lat, double lng})?> position() async => at;
}

void main() {
  group('review and approval levels', () {
    testWidgets('are hidden until a checklist is picked, as on the web', (tester) async {
      await _pump(tester, 'tasks:create', _taskForm());

      expect(find.text('Checklist · Optional — it adds review and approval levels'), findsWidgets);
      expect(find.text('Reviewers'), findsNothing);
      expect(find.text('Approvers'), findsNothing);

      // Pick the assignee, then a checklist.
      await tester.tap(find.widgetWithText(Btn, 'Choose').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ravi Shankar').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Btn, 'Add').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Column casting QC').last);
      await tester.pumpAndSettle();

      expect(find.text('Reviewers'), findsOneWidget);
      expect(find.text('Approvers'), findsOneWidget);
    });

    testWidgets('level 1 is the assignee, shown and not editable', (tester) async {
      await _pump(tester, 'tasks:create', _taskForm());

      await tester.tap(find.widgetWithText(Btn, 'Choose').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ravi Shankar').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Btn, 'Add').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Column casting QC').last);
      await tester.pumpAndSettle();

      // The web's own wording, and no picker on that row.
      expect(find.text('Ravi Shankar · the assignee'), findsOneWidget);
      expect(find.text('Level 1'), findsWidgets);
      expect(find.byKey(const Key('level:reviewerIds:0')), findsNothing);
      // And the next level is offered by its own button.
      expect(find.text('+ Add level 2'), findsOneWidget);
    });

    testWidgets('a second reviewer is added by level and sent in order', (tester) async {
      final b = await _pump(tester, 'tasks:create', _taskForm());

      await tester.enterText(find.byKey(const Key('field-title')), 'Snag the 8th floor');
      await tester.tap(find.widgetWithText(Btn, 'Choose').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ravi Shankar').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Btn, 'Add').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Column casting QC').last);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('+ Add level 2'), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('+ Add level 2'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('level:reviewerIds:1')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('level:reviewerIds:1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Anil Deshpande').last);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(Btn, 'Assign task'));
      await tester.pumpAndSettle();

      final sent = b.calls.last.body!['args'] as List;
      final body = (sent.first as Map)['reviewerIds'] as List;
      // The assignee first, then the level above them — the order the action
      // reads as level 1, level 2.
      expect(body, ['u1', 'u2']);
    });
  });

  group('where the log was written', () {
    Map<String, Object> logForm() => {
          '/form/projects/progress/create': const {
            'key': 'projects/progress:create',
            'module': 'projects/progress',
            'title': 'Log site progress',
            'submitLabel': 'Save log',
            'action': 'projects/progress/createProgressLog',
            'shape': {'kind': 'formData'},
            'fields': [
              {'name': 'title', 'label': 'What happened today', 'kind': 'text', 'required': true},
              {
                'name': 'position',
                'label': 'Location',
                'kind': 'geo',
                'note': 'Taken from this phone, as the web takes it from the browser.',
              },
            ],
          },
          '/do/projects/progress/createProgressLog': const {'ok': true},
        };

    testWidgets('is taken from the phone and sent as the web posts it', (tester) async {
      Where.live = _FakeWhere((lat: 12.97123, lng: 77.59456));
      final b = await _pump(tester, 'projects/progress:create', logForm());

      await tester.enterText(find.byKey(const Key('field-title')), 'Slab shuttering');
      await tester.tap(find.byKey(const Key('geo-position')));
      await tester.pumpAndSettle();

      // Shown once known, to five places as the web prints it.
      expect(find.text('12.97123, 77.59456'), findsOneWidget);

      await tester.tap(find.widgetWithText(Btn, 'Save log'));
      await tester.pumpAndSettle();

      final body = ((b.calls.last.body!['args'] as List).first as Map);
      expect(body['latitude'], 12.97123);
      expect(body['longitude'], 77.59456);
    });

    testWidgets('a refusal is said plainly and the log still saves', (tester) async {
      Where.live = _FakeWhere(null, 'Location permission was refused, so the log is saved without it.');
      final b = await _pump(tester, 'projects/progress:create', logForm());

      await tester.enterText(find.byKey(const Key('field-title')), 'Slab shuttering');
      await tester.tap(find.byKey(const Key('geo-position')));
      await tester.pumpAndSettle();
      expect(
        find.text('Location permission was refused, so the log is saved without it.'),
        findsOneWidget,
      );

      await tester.tap(find.widgetWithText(Btn, 'Save log'));
      await tester.pumpAndSettle();

      final body = ((b.calls.last.body!['args'] as List).first as Map);
      expect(body.containsKey('latitude'), isFalse);
      expect(body['title'], 'Slab shuttering');
    });
  });

  group('the country code beside a number', () {
    testWidgets('is joined onto it and not sent by itself', (tester) async {
      final b = await _pump(tester, 'hr/employees:edit', {
        '/form/hr/employees/edit': const {
          'key': 'hr/employees:edit',
          'module': 'hr/employees',
          'title': 'Edit employee',
          'submitLabel': 'Save',
          'action': 'hr/updateEmployee',
          'shape': {'kind': 'positional', 'order': ['\$id', '\$values']},
          'fields': [
            {
              'name': 'mobileCode',
              'label': 'Country code',
              'kind': 'select',
              'initial': '+91 India',
              'prefixes': 'mobile',
              'options': [
                {'value': '+91 India', 'label': '+91 India'},
                {'value': '+971 UAE', 'label': '+971 UAE'},
              ],
            },
            {'name': 'mobile', 'label': 'Mobile number', 'kind': 'phone', 'required': true},
          ],
        },
        '/do/hr/updateEmployee': const {'ok': true},
      });

      await tester.enterText(find.byKey(const Key('field-mobile')), '98765 43210');
      await tester.tap(find.widgetWithText(Btn, 'Save'));
      await tester.pumpAndSettle();

      final values = (b.calls.last.body!['args'] as List)[1] as Map;
      expect(values['mobile'], '+91 98765 43210');
      expect(values.containsKey('mobileCode'), isFalse);
    });
  });
}
