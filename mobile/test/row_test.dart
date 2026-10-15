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
      onPickProject: () {},
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
}
