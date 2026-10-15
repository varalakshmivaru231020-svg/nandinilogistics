import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// A record with the web's own tabs.
///
/// The task detail has three — Checklist, Review and approval, History — and
/// each of its cards belongs to one. The checklist tab carries the bar the web
/// draws over it, each point's own square, and Approve or Deny where the
/// viewer is the level holding it.

Map<String, Object> _task() => {
      'key': 'tasks',
      'id': 't1',
      'title': 'Slab shuttering check',
      'subtitle': 'T-9001 · NNS',
      'pills': const [
        {'label': 'Under review L1', 'tone': 'warn'},
      ],
      'tabs': const [
        {'key': 'checklist', 'label': 'Checklist'},
        {'key': 'levels', 'label': 'Review and approval'},
        {'key': 'history', 'label': 'History'},
      ],
      'tabNote': 'Next: Approver level 1 · Vikas Verma',
      'sections': const [
        {
          'label': 'The task',
          'fields': [
            {'label': 'Task no.', 'value': 'T-9001'},
          ],
        },
      ],
      'collections': [
        {
          'tab': 'checklist',
          'key': 'checklist:c1',
          'label': 'Column casting QC · 1 of 2 approved',
          'progress': const {'done': 1, 'total': 2, 'note': 'Yours to review · 1'},
          'rows': const [
            {
              'id': 'i1',
              'badge': {'text': '✓', 'tone': 'good'},
              'title': 'Shuttering plumb checked',
              'subtitle': 'Approved by Ravi Shankar',
              'pills': [
                {'label': 'Approved', 'tone': 'good'},
              ],
              'actions': [],
            },
            {
              'id': 'i2',
              'badge': {'text': '02', 'tone': 'draft'},
              'title': 'Cover blocks placed',
              'pills': [
                {'label': 'Review L1 · Anil Deshpande', 'tone': 'warn'},
              ],
              'actions': [
                {
                  'key': 'pass',
                  'label': 'Approve',
                  'emphasis': 'approve',
                  'action': 'tasks/reviewChecklistItem',
                  'args': ['i2', 'PASS'],
                  'remark': 'optional',
                  'remarkLabel': 'Remark',
                  'confirm': 'This point moves to the next level.',
                },
                {
                  'key': 'fail',
                  'label': 'Deny',
                  'emphasis': 'reject',
                  'action': 'tasks/reviewChecklistItem',
                  'args': ['i2', 'FAIL'],
                  'remark': 'required',
                  'remarkLabel': 'What is wrong',
                  'confirm': 'This point alone goes back to reviewer 1.',
                },
              ],
            },
          ],
        },
        {
          'tab': 'levels',
          'key': 'levels',
          'label': 'One person a level, in order.',
          'rows': const [
            {
              'id': 'l1',
              'badge': {'text': '1', 'tone': 'info'},
              'title': 'Anil Deshpande (you)',
              'subtitle': 'Reviewer L1',
              'pills': [
                {'label': '1 point with them', 'tone': 'info'},
              ],
            },
          ],
        },
        {
          'tab': 'history',
          'key': 'history',
          'label': 'History',
          'rows': const [
            {'id': 'h1', 'title': 'Task accepted', 'subtitle': 'Ravi Shankar · 2026-10-14'},
          ],
        },
      ],
      'actions': const [],
      'serverTime': '2026-10-15T06:00:00.000Z',
    };

Future<Boundary> _pump(WidgetTester tester, {Map<String, Object>? extra}) async {
  useEmptyPrefs();
  final b = Boundary({
    '/record/tasks/t1': _task(),
    '/do/tasks/reviewChecklistItem': const {'ok': true},
    ...?extra,
  });
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: RecordScreen(api: b.api, module: 'tasks', id: 't1', fallbackTitle: 'Task'),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('a record with tabs', () {
    testWidgets('opens on the first tab and shows only its cards', (tester) async {
      await _pump(tester);

      // The web's own three tabs, and the line beside them.
      expect(find.text('Checklist'), findsWidgets);
      expect(find.text('Review and approval'), findsOneWidget);
      expect(find.text('History'), findsWidgets);
      expect(find.text('Next: Approver level 1 · Vikas Verma'), findsOneWidget);

      // The checklist tab is open: its points are there, the other tabs' are not.
      expect(find.text('Cover blocks placed'), findsOneWidget);
      expect(find.text('Anil Deshpande (you)'), findsNothing);
      expect(find.text('Task accepted'), findsNothing);
    });

    testWidgets('the checklist carries its bar, its counts and its squares', (tester) async {
      await _pump(tester);

      expect(find.text('COLUMN CASTING QC · 1 OF 2 APPROVED'), findsOneWidget);
      expect(find.text('Yours to review · 1'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      // The square at the head of each line.
      expect(find.text('✓'), findsOneWidget);
      expect(find.text('02'), findsOneWidget);
    });

    testWidgets('approving a point calls the action for that point', (tester) async {
      final b = await _pump(tester);

      await tester.scrollUntilVisible(find.byKey(const Key('row:i2:pass')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('row:i2:pass')));
      await tester.pumpAndSettle();
      expect(find.text('This point moves to the next level.'), findsOneWidget);

      await tester.tap(find.widgetWithText(Btn, 'Approve').last);
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'tasks/reviewChecklistItem');
      // The optional remark travels as the empty string it was left as.
      expect(b.actions.last.args, ['i2', 'PASS', '']);
    });

    testWidgets('switching tab shows that tab\'s cards', (tester) async {
      await _pump(tester);

      await tester.tap(find.widgetWithText(FilterChip2, 'Review and approval'));
      await tester.pumpAndSettle();
      expect(find.text('Anil Deshpande (you)'), findsOneWidget);
      expect(find.text('1 point with them'), findsOneWidget);
      expect(find.text('Cover blocks placed'), findsNothing);

      await tester.tap(find.widgetWithText(FilterChip2, 'History'));
      await tester.pumpAndSettle();
      expect(find.text('Task accepted'), findsOneWidget);
    });
  });

  group('a checkpoint, moved by its icons', () {
    testWidgets('↑ ↓ and 🗑 are drawn as the web draws them, and each calls its action',
        (tester) async {
      // Semantics has to be on before the tree is built for a label to be found.
      final semantics = tester.ensureSemantics();
      useEmptyPrefs();
      final b = Boundary({
        '/record/checklists/cl1': const {
          'key': 'checklists',
          'id': 'cl1',
          'title': 'Column casting QC',
          'subtitle': 'Structural · v1.2',
          'pills': [],
          'sections': [],
          'collections': [
            {
              'key': 'points:cl1',
              'label': 'Points · 2',
              'rows': [
                {
                  'id': 'p1',
                  'badge': {'text': '01', 'tone': 'info'},
                  'title': 'Shuttering plumb checked',
                  'actions': [
                    {
                      'key': 'text:p1',
                      'label': 'Edit text',
                      'emphasis': 'outline',
                      'action': 'checklists/updateCheckpoint',
                      'args': ['p1', {'text': '\$text'}],
                      'remark': 'none',
                      'fields': [
                        {'name': 'text', 'label': 'Checkpoint', 'kind': 'text', 'required': true},
                      ],
                    },
                    {
                      'key': 'down:p1',
                      'label': 'Move down',
                      'glyph': '↓',
                      'emphasis': 'outline',
                      'action': 'checklists/moveCheckpoint',
                      'args': ['p1', 'down'],
                      'remark': 'none',
                      'confirm': 'It swaps with the point below it.',
                    },
                    {
                      'key': 'drop:p1',
                      'label': 'Delete checkpoint',
                      'glyph': '🗑',
                      'emphasis': 'reject',
                      'action': 'checklists/deleteCheckpoint',
                      'args': ['p1'],
                      'remark': 'none',
                      'confirm': 'The remaining points are renumbered.',
                    },
                  ],
                },
              ],
            },
          ],
          'actions': [],
          'serverTime': '2026-10-15T06:00:00.000Z',
        },
        '/do/checklists/moveCheckpoint': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(api: b.api, module: 'checklists', id: 'cl1', fallbackTitle: 'Checklist'),
      ));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.byKey(const Key('row:p1:down:p1')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();

      // The glyphs the web uses, and the worded button beside them.
      expect(find.text('↓'), findsOneWidget);
      expect(find.text('🗑'), findsOneWidget);
      expect(find.text('Edit text'), findsOneWidget);
      // Each icon keeps its name, for anyone reading the screen aloud.
      expect(find.bySemanticsLabel('Move down'), findsWidgets);

      await tester.scrollUntilVisible(find.byKey(const Key('row:p1:down:p1')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('row:p1:down:p1')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Btn, 'Move down').last);
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'checklists/moveCheckpoint');
      expect(b.actions.last.args, ['p1', 'down']);
      semantics.dispose();
    });
  });
}
