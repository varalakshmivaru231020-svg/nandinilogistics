import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';

import 'support.dart';

/// The row the server composed, drawn.
///
/// The app used to build each row itself out of the export's columns, so an
/// indent on the phone had no approval chain, no fulfilment line and no
/// "required by". It is sent drawn now, and this is what arriving drawn looks
/// like on screen.

const _indentScreen = {
  'key': 'material/indents',
  'href': '/material/indents',
  'title': 'Indents',
  'countNoun': 'indents',
  'searchPlaceholder': 'Search indent no., item, project, activity…',
  'filters': [],
  'dateRange': {'label': 'Raised'},
  'forms': [],
  'record': true,
};

Map<String, Object> _list() => {
      '/screen/material/indents': _indentScreen,
      '/list/material/indents?page=1&pageSize=50': {
        'title': 'Indents',
        'filters': 'All indents in view',
        'columns': const [
          {'key': 'indentNo', 'header': 'Indent No'},
        ],
        'rows': const [
          {'id': 'i1', 'indentNo': 'IND/NNS/2026-27/9002'},
        ],
        'total': 1,
        'page': 1,
        'pageSize': 50,
        'hasMore': false,
        'serverTime': '2026-10-15T06:00:00.000Z',
        'screen': const {
          'band': [
            {'value': '4', 'label': 'Indents'},
            {'value': '2', 'label': 'Awaiting approval', 'tone': 'warn'},
          ],
          'note': 'An indent is an internal request to the store, not a purchase.',
          'rows': [
            {
              'id': 'i1',
              'title': 'AAC Block 600x200x200 · 3,000 Numbers +1 more',
              'meta': 'IND/NNS/2026-27/9002 · NN Skyline · by Ravi Shankar · raised 29 Aug 2026',
              'lines': [
                {'label': 'Required by', 'value': '08 Sep 2026'},
                {'value': 'Excavation & PCC'},
              ],
              'chain': [
                {'short': 'R', 'name': 'Raised', 'state': 'done'},
                {'short': 'PM', 'name': 'PM approval', 'state': 'now'},
                {'short': 'ST', 'name': 'Store stock check', 'state': 'todo'},
              ],
              'pill': {
                'label': 'PART ISSUE + PO',
                'tone': 'info',
                'text': '0 of 2 lines issued · 1 line needs a PO',
              },
              'status': {'label': 'Pending approval', 'tone': 'warn'},
            },
          ],
        },
      },
    };

Future<Boundary> _pump(WidgetTester tester, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ModuleScreen(
      api: b.api,
      session: sessionWith(const ['material.indent.view']),
      moduleKey: 'material/indents',
      onBack: () {},
      bottom: const SizedBox.shrink(),
      onOpenRelated: (_) {},
    ),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('a row the web composed', () {
    testWidgets('draws every part of it, and none of its own', (tester) async {
      await _pump(tester, _list());

      // What was asked for, and the line the card writes under it.
      expect(find.text('AAC Block 600x200x200 · 3,000 Numbers +1 more'), findsOneWidget);
      expect(
        find.text('IND/NNS/2026-27/9002 · NN Skyline · by Ravi Shankar · raised 29 Aug 2026'),
        findsOneWidget,
      );

      // The labelled columns, labelled as the web labels them.
      expect(find.text('Required by: 08 Sep 2026'), findsOneWidget);
      expect(find.text('Excavation & PCC'), findsOneWidget);

      // What will actually happen to it, and the sentence under the pill.
      expect(find.text('PART ISSUE + PO'), findsOneWidget);
      expect(find.text('0 of 2 lines issued · 1 line needs a PO'), findsOneWidget);

      // The status, in the web's own words.
      expect(find.text('Pending approval'), findsOneWidget);

      // The approval chain, as far as it has got.
      expect(find.byType(Chain), findsOneWidget);
      expect(find.text('PM'), findsOneWidget);
    });

    testWidgets('opens the band and the note the web screen has', (tester) async {
      await _pump(tester, _list());

      expect(find.text('Awaiting approval'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.textContaining('An indent is an internal request'),
        300,
        scrollable: find
            .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
            .last,
      );
      expect(find.textContaining('An indent is an internal request'), findsOneWidget);
    });

    testWidgets('a report, whose rows the server did not compose, reads its columns',
        (tester) async {
      await _pump(tester, {
        '/screen/material/indents': _indentScreen,
        '/list/material/indents?page=1&pageSize=50': {
          'title': 'Indents',
          'filters': '',
          'columns': const [
            {'key': 'name', 'header': 'Employee'},
            {'key': 'payable', 'header': 'Payable days'},
          ],
          'rows': const [
            {'id': 'e1', 'name': 'Ravi Shankar', 'payable': '24'},
          ],
          'total': 1,
          'page': 1,
          'pageSize': 50,
          'hasMore': false,
          'serverTime': '2026-10-15T06:00:00.000Z',
        },
      });

      // The first column is the heading; the rest are labelled as the report
      // heads them.
      expect(find.text('Ravi Shankar'), findsOneWidget);
      expect(find.text('Payable days: 24'), findsOneWidget);
    });
  });

  rowActions();
}

/// The buttons the web's own row carries, on the phone's row.
///
/// Which buttons appear is the server's decision — the row card holds no rule
/// about status or permission — and running one calls exactly the action and
/// arguments the server named.
void rowActions() {
  group('a row that carries the web row\'s buttons', () {
    Map<String, Object> listWith(List<Map<String, Object>> actions) => {
          '/screen/material/indents': _indentScreen,
          '/list/material/indents?page=1&pageSize=50': {
            'title': 'Indents',
            'filters': '',
            'columns': const [
              {'key': 'indentNo', 'header': 'Indent No'},
            ],
            'rows': const [
              {'id': 'i1', 'indentNo': 'IND-1'},
            ],
            'total': 1,
            'page': 1,
            'pageSize': 50,
            'hasMore': false,
            'serverTime': '2026-10-15T06:00:00.000Z',
            'screen': {
              'rows': [
                {
                  'id': 'i1',
                  'title': 'Shuttering Plywood 12mm',
                  'status': {'label': 'Pending approval', 'tone': 'warn'},
                  'actions': actions,
                },
              ],
            },
          },
          '/do/material/indents/approveIndent': {'ok': true},
        };

    testWidgets('draws them, and only the ones it was sent', (tester) async {
      await _pump(tester, listWith([
        const {
          'key': 'approve',
          'label': '✓ PM approve',
          'emphasis': 'approve',
          'action': 'material/indents/approveIndent',
          'args': ['i1', 'PM'],
          'remark': 'none',
          'confirm': 'It goes to the Admin for the second approval.',
        },
      ]));

      expect(find.text('✓ PM approve'), findsOneWidget);
      expect(find.text('Reject'), findsNothing);
    });

    testWidgets('runs the server\'s own action and arguments', (tester) async {
      final b = await _pump(tester, listWith([
        const {
          'key': 'approve',
          'label': '✓ PM approve',
          'emphasis': 'approve',
          'action': 'material/indents/approveIndent',
          'args': ['i1', 'PM'],
          'remark': 'none',
          'confirm': 'It goes to the Admin for the second approval.',
        },
      ]));

      await tester.tap(find.byKey(const Key('row-action:i1:approve')));
      await tester.pumpAndSettle();

      // The sheet says what will happen, in the server's words.
      expect(find.text('It goes to the Admin for the second approval.'), findsOneWidget);

      await tester.tap(find.widgetWithText(Btn, '✓ PM approve').last);
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'material/indents/approveIndent');
      expect(b.actions.last.args, ['i1', 'PM']);
    });

    testWidgets('a button whose action is a form opens the form', (tester) async {
      final routes = listWith([
        const {
          'key': 'edit',
          'label': 'Edit',
          'emphasis': 'outline',
          'action': '',
          'args': [],
          'remark': 'none',
          'form': 'material/indents:edit',
        },
      ]);
      routes['/form/material/indents/edit?id=i1'] = const {
        'key': 'material/indents:edit',
        'module': 'material/indents',
        'title': 'Edit indent',
        'submit': 'Save',
        'action': 'material/indents/updateIndent',
        'shape': {'kind': 'formData'},
        'fields': [
          {'name': 'purpose', 'label': 'Purpose', 'kind': 'text'},
        ],
      };
      await _pump(tester, routes);

      await tester.tap(find.byKey(const Key('row-action:i1:edit')));
      await tester.pumpAndSettle();

      expect(find.text('Edit indent'), findsOneWidget);
      expect(find.text('Purpose'), findsOneWidget);
    });
  });
}
