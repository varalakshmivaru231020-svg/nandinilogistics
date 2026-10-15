import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';
import 'package:nninfra/modules/spec.dart';

import 'support.dart';

/// A list, as the web's own screen behaves.
///
/// The parameters are the point. The web keeps its search, its filters and its
/// page in the URL and sends every one of them to the same query; the phone
/// holds them in the screen and must send the same set — together, not one at
/// a time — and must not lose them when somebody opens a record and comes
/// back.

Map<String, dynamic> taskRow(int n) => {
      'id': 't$n',
      'taskNo': 'T-90${n.toString().padLeft(2, "0")}',
      'title': 'Task number $n',
      'project': 'NNS',
      'assignee': 'Ravi Shankar',
      'status': 'PENDING',
      'priority': 'MEDIUM',
      'dueAt': '2026-10-20T10:00:00.000Z',
    };

/// The list endpoint, answering whatever page was asked for.
Map<String, Object> listOf(int total, {int pageSize = 50}) {
  final out = <String, Object>{
    '/screen/tasks': {
      'key': 'tasks',
      'href': '/tasks',
      'title': 'Tasks',
      'countNoun': 'task',
      'searchPlaceholder': 'Search task number, title or assignee…',
      'filters': [
        {
          'name': 'status',
          'label': 'Status',
          'allLabel': 'All',
          'options': [
            {'value': 'pending', 'label': 'Pending'},
            {'value': 'closed', 'label': 'Closed'},
          ],
        },
      ],
      'dateRange': null,
      'forms': [],
      'record': true,
    },
  };
  // Every page of it, keyed by the query the screen will send.
  for (var page = 1; page <= (total / pageSize).ceil(); page++) {
    final from = (page - 1) * pageSize;
    final rows = [
      for (var i = from; i < (from + pageSize).clamp(0, total); i++) taskRow(i + 1),
    ];
    out['/list/tasks?page=$page&pageSize=$pageSize'] = {
      'title': 'Tasks',
      'filters': 'Everything open',
      'columns': const [
        {'key': 'taskNo', 'header': 'Task'},
      ],
      'rows': rows,
      'summary': const [],
      'total': total,
      'page': page,
      'pageSize': pageSize,
      'hasMore': from + rows.length < total,
      'serverTime': '2026-10-15T06:00:00.000Z',
    };
  }
  return out;
}

/// The list's own scrollable. The screen has others — the metric band and the
/// applied-filter chips both scroll sideways — so a scroll has to name this one.
Finder get _down => find.byWidgetPredicate(
      (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
    );

Future<void> _toFoot(WidgetTester tester, Finder target, {double step = 400}) async {
  await tester.scrollUntilVisible(target, step, scrollable: _down.last);
  await tester.pumpAndSettle();
}

Future<Boundary> pumpList(WidgetTester tester, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ModuleScreen(
      api: b.api,
      session: sessionWith(const ['task.task.view']),
      spec: moduleSpecs['tasks']!,
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
  group('a page at a time', () {
    testWidgets('asks for the first page and says how many matched',
        (tester) async {
      final b = await pumpList(tester, listOf(120));

      // The count is what matches, not what has been fetched.
      expect(find.text('120 tasks · All projects'), findsOneWidget);
      expect(b.gets.any((g) => g == '/list/tasks?page=1&pageSize=50'), isTrue);

      // The foot of the list says how far it has read. A long list builds
      // lazily, so it has to be scrolled to before it exists at all.
      await _toFoot(tester, find.byKey(const Key('load-more')));
      expect(find.text('50 of 120 loaded'), findsOneWidget);
    });

    testWidgets('appends the next page and keeps the ones already read',
        (tester) async {
      final b = await pumpList(tester, listOf(120));

      await _toFoot(tester, find.byKey(const Key('load-more')));
      await tester.tap(find.byKey(const Key('load-more')));
      await tester.pumpAndSettle();

      expect(b.gets.last, '/list/tasks?page=2&pageSize=50');
      await _toFoot(tester, find.text('100 of 120 loaded'));
      expect(find.text('100 of 120 loaded'), findsOneWidget);
      // The first page is still there — the second was added, not swapped in.
      await _toFoot(tester, find.text('T-9001 · NNS'), step: -400);
      expect(find.text('T-9001 · NNS'), findsOneWidget);
    });

    testWidgets('no more to load, no button', (tester) async {
      await pumpList(tester, listOf(12));
      expect(find.byKey(const Key('load-more')), findsNothing);
      expect(find.text('12 tasks · All projects'), findsOneWidget);
    });
  });

  group('search, filter and page together', () {
    /*
     * The web puts all three in one URL and sends them to one query. The
     * screen has to do the same: filtering after a search must not drop the
     * search, and either must start again at page one — a page-three row has
     * no business surviving a filter change.
     */
    testWidgets('every parameter travels in the same request', (tester) async {
      final routes = listOf(120);
      routes['/list/tasks?q=slab&page=1&pageSize=50'] = routes['/list/tasks?page=1&pageSize=50']!;
      routes['/list/tasks?q=slab&status=pending&page=1&pageSize=50'] =
          routes['/list/tasks?page=1&pageSize=50']!;
      final b = await pumpList(tester, routes);

      // Search…
      await tester.tap(find.byTooltip('Search'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('search')), 'slab');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(b.gets.last, contains('q=slab'));

      // …then filter, which must carry the search with it.
      await tester.tap(find.byTooltip('Filter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pending'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('apply-filters')));
      await tester.pumpAndSettle();

      final last = b.gets.last;
      expect(last, contains('q=slab'));
      expect(last, contains('status=pending'));
      // And back to the first page, as the web drops `page` on a filter change.
      expect(last, contains('page=1'));
    });
  });

  group('coming back from a record', () {
    /// The web keeps its filters in the URL, so going back keeps them. The
    /// phone holds them in the screen — and must not reset them.
    testWidgets('keeps the search and the filter that were applied',
        (tester) async {
      final routes = listOf(120);
      routes['/list/tasks?q=slab&page=1&pageSize=50'] = routes['/list/tasks?page=1&pageSize=50']!;
      routes['/record/tasks/t1'] = const {
        'key': 'tasks',
        'id': 't1',
        'title': 'Task number 1',
        'subtitle': 'T-9001',
        'pills': [],
        'sections': [],
        'collections': [],
        'actions': [],
        'serverTime': '2026-10-15T06:00:00.000Z',
      };
      final b = await pumpList(tester, routes);

      await tester.tap(find.byTooltip('Search'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('search')), 'slab');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      // Open a record…
      await tester.tap(find.text('Task number 1'));
      await tester.pumpAndSettle();
      expect(find.text('T-9001'), findsWidgets);

      // …and come back.
      await tester.pageBack();
      await tester.pumpAndSettle();

      // The search box still holds it, and nothing was re-fetched without it.
      expect(find.text('slab'), findsOneWidget);
      expect(b.gets.where((g) => g.startsWith('/list/tasks')).last, contains('q=slab'));
    });
  });
}
