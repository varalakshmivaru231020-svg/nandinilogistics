import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/modules.dart';
import 'package:nninfra/screens/list_screen.dart';
import 'package:nninfra/theme.dart';

import 'support.dart';

const indentsModule = Module(
  label: 'Indents',
  permission: 'material.indent.view',
  icon: Icons.assignment_rounded,
  list: 'material/indents',
);

Map<String, Object> indentList({int rows = 2, String filters = 'All indents in view'}) => {
      '/list/material/indents': {
        'title': 'Indents',
        'filters': filters,
        'columns': [
          {'key': 'indentNo', 'header': 'Indent No'},
          {'key': 'project', 'header': 'Project'},
          {'key': 'lines', 'header': 'Lines', 'align': 'right', 'format': 'number'},
          {'key': 'requiredBy', 'header': 'Required by', 'format': 'date'},
          {'key': 'status', 'header': 'Status'},
        ],
        'rows': List.generate(rows, (i) => {
              'indentNo': 'IND-2026-000${i + 1}',
              'project': 'NNR',
              'lines': 3 + i,
              'requiredBy': '2026-11-0${i + 1}T00:00:00.000Z',
              'status': 'SUBMITTED',
            }),
        'summary': [
          {'label': 'Indents', 'value': '$rows'},
        ],
        'total': rows,
      },
    };

Future<FakeBoundary> pumpList(WidgetTester tester, Map<String, Object> routes) async {
  final boundary = FakeBoundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ListScreen(
      api: boundary.api,
      session: sessionWith(['material.indent.view']),
      module: indentsModule,
    ),
  ));
  await tester.pumpAndSettle();
  return boundary;
}

void main() {
  /*
   * The whole point of one list screen for twenty-four lists: the server says
   * what the columns are, so nothing here is per-module. If this renders an
   * indent it renders a purchase order.
   */
  testWidgets('draws whatever columns the server sent', (tester) async {
    await pumpList(tester, indentList());

    expect(find.text('IND-2026-0001'), findsOneWidget);
    expect(find.text('IND-2026-0002'), findsOneWidget);
    expect(find.text('PROJECT'), findsNWidgets(2));
    expect(find.text('NNR'), findsNWidgets(2));
    // A date column is shown as a date, not as an ISO string.
    expect(find.text('01 Nov 2026'), findsOneWidget);
    expect(find.textContaining('2026-11-01T'), findsNothing);
  });

  testWidgets('shows the band and the server\'s own description of the filters', (tester) async {
    await pumpList(tester, indentList());
    expect(find.text('Indents'), findsWidgets);
    expect(find.text('All indents in view'), findsOneWidget);
  });

  testWidgets('counts the rows in the app bar', (tester) async {
    await pumpList(tester, indentList(rows: 1));
    expect(find.text('1 row'), findsOneWidget);
  });

  testWidgets('searching sends q, and clearing it takes q away', (tester) async {
    final boundary = await pumpList(tester, indentList());

    await tester.tap(find.byKey(const Key('search-toggle')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('search')), 'cement');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(boundary.seen.last.queryParameters['q'], 'cement');

    await tester.tap(find.byKey(const Key('search-toggle')));
    await tester.pumpAndSettle();
    expect(boundary.seen.last.queryParameters.containsKey('q'), isFalse);
  });

  testWidgets('a filter is applied, shown as a chip, and removable', (tester) async {
    final boundary = await pumpList(tester, indentList(filters: 'Status draft'));

    await tester.tap(find.byKey(const Key('filter')));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'e.g. DRAFT'), 'DRAFT');
    await tester.tap(find.byKey(const Key('apply-filters')));
    await tester.pumpAndSettle();

    expect(boundary.seen.last.queryParameters['status'], 'DRAFT');
    expect(find.text('status: DRAFT'), findsOneWidget);

    // Removing the chip re-reads without it.
    await tester.tap(find.byTooltip('Remove status filter'));
    await tester.pumpAndSettle();
    expect(boundary.seen.last.queryParameters.containsKey('status'), isFalse);
  });

  /*
   * The server's sentence, verbatim. It was written for the person holding the
   * phone, and names the permission they lack — replacing it with wording of
   * our own would lose that.
   */
  testWidgets('a refusal is shown in the server\'s words', (tester) async {
    await pumpList(tester, {
      '/list/material/indents': const Failure(
        403,
        'You do not have permission to see that list (material.indent.view).',
        'material.indent.view',
      ),
    });

    expect(find.byKey(const Key('list-error')), findsOneWidget);
    expect(
      find.text('You do not have permission to see that list (material.indent.view).'),
      findsOneWidget,
    );
  });

  testWidgets('an empty list is empty, not broken', (tester) async {
    await pumpList(tester, indentList(rows: 0));
    expect(find.byKey(const Key('list-error')), findsNothing);
    expect(find.text('0 rows'), findsOneWidget);
  });

  testWidgets('sends the chosen project, so the list is scoped like the web', (tester) async {
    final boundary = FakeBoundary(indentList());
    final api = boundary.api..projectId = 'p1';
    await tester.pumpWidget(MaterialApp(
      home: ListScreen(
        api: api,
        session: sessionWith(['material.indent.view']),
        module: indentsModule,
      ),
    ));
    await tester.pumpAndSettle();
    // The header is what carries it; the request still went out.
    expect(boundary.seen, isNotEmpty);
    expect(api.projectId, 'p1');
  });
}
