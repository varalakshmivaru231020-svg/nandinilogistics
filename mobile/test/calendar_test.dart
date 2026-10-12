import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/screens/calendar_screen.dart';
import 'package:nninfra/theme.dart';

import 'support.dart';

/// 1 Oct 2026 is a Thursday, so the grid opens on Monday 28 Sep and runs to
/// Sunday 8 Nov — always 42 squares, so the panel below never changes height.
List<String> octoberGrid() {
  final out = <String>[];
  var day = DateTime(2026, 9, 28);
  for (var i = 0; i < 42; i++) {
    out.add('${day.year}-${day.month.toString().padLeft(2, "0")}-${day.day.toString().padLeft(2, "0")}');
    day = day.add(const Duration(days: 1));
  }
  return out;
}

Map<String, Object> agenda({
  required List<Map<String, dynamic>> items,
  String serverTime = '2026-10-10T12:00:00.000Z',
}) =>
    {
      '/calendar': {
        'view': 'month',
        'grid': octoberGrid(),
        'items': items,
        'counts': const {},
        'tally': {'total': items.length, 'overdue': 0, 'needsResponse': 0},
        'serverTime': serverTime,
      },
    };

Map<String, dynamic> item({
  required String title,
  required String kind,
  required String at,
  String? endAt,
  String tone = 'brand',
  bool done = false,
  bool needsResponse = false,
}) =>
    {
      'id': title,
      'kind': kind,
      'title': title,
      'subtitle': null,
      'at': at,
      'endAt': endAt,
      'allDay': false,
      'href': '/calendar',
      'tone': tone,
      'done': done,
      'needsResponse': needsResponse,
    };

Future<FakeBoundary> pumpCalendar(WidgetTester tester, Map<String, Object> routes) async {
  final boundary = FakeBoundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: CalendarScreen(api: boundary.api, session: sessionWith(['calendar.agenda.view'])),
  ));
  await tester.pumpAndSettle();
  return boundary;
}

void main() {
  testWidgets('draws the six weeks the server sent, and no more', (tester) async {
    await pumpCalendar(tester, agenda(items: const []));
    // 42 squares, every one of them tappable.
    final squares = find.byWidgetPredicate(
      (w) => w is InkWell && w.key is ValueKey<String> &&
          (w.key as ValueKey<String>).value.startsWith('day-'),
    );
    expect(squares, findsNWidgets(42));
    expect(find.byKey(const Key('day-2026-09-28')), findsOneWidget);
    expect(find.byKey(const Key('day-2026-11-08')), findsOneWidget);
  });

  testWidgets('puts an item on the day it falls on, and shows it when picked', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(title: 'Slab walk', kind: 'TASK', at: '2026-10-14T10:00:00.000Z', tone: 'warn'),
    ]));

    await tester.tap(find.byKey(const Key('day-2026-10-14')));
    await tester.pumpAndSettle();

    expect(find.text('Slab walk'), findsOneWidget);
    expect(find.textContaining('Wednesday, 14 October'), findsOneWidget);
  });

  /*
   * A span shows on every square it crosses, not only the first. Otherwise a
   * three-day activity vanishes from the middle of the week.
   */
  testWidgets('a span appears on each day it crosses', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(
        title: 'Plastering',
        kind: 'ACTIVITY',
        at: '2026-10-12T04:30:00.000Z',
        endAt: '2026-10-14T12:30:00.000Z',
        tone: 'slate',
      ),
    ]));

    for (final day in ['2026-10-12', '2026-10-13', '2026-10-14']) {
      await tester.tap(find.byKey(Key('day-$day')));
      await tester.pumpAndSettle();
      expect(find.text('Plastering'), findsOneWidget, reason: day);
    }
  });

  /*
   * Overdue is decided against the server's instant. If the handset's clock
   * were used, a phone an hour fast would disagree with the web about what is
   * late — and the person on site would be the one who is wrong.
   */
  testWidgets('measures overdue against the server\'s clock, not the device\'s', (tester) async {
    await pumpCalendar(tester, agenda(
      serverTime: '2026-10-10T12:00:00.000Z',
      items: [
        item(title: 'Was due', kind: 'TASK', at: '2026-10-08T10:00:00.000Z'),
      ],
    ));

    await tester.tap(find.byKey(const Key('day-2026-10-08')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('overdue-pill')), findsOneWidget);
  });

  /* A meeting that has finished is not overdue — it happened. */
  testWidgets('a calendar entry that has simply happened is not overdue', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(title: 'Review meeting', kind: 'EVENT', at: '2026-10-08T10:00:00.000Z'),
    ]));

    await tester.tap(find.byKey(const Key('day-2026-10-08')));
    await tester.pumpAndSettle();
    expect(find.text('Review meeting'), findsOneWidget);
    expect(find.byKey(const Key('overdue-pill')), findsNothing);
  });

  testWidgets('something finished is never late, whatever its date', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(title: 'Finished task', kind: 'TASK', at: '2026-10-01T10:00:00.000Z', done: true),
    ]));

    await tester.tap(find.byKey(const Key('day-2026-10-01')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('overdue-pill')), findsNothing);
  });

  testWidgets('an invitation waiting on an answer says so', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(
        title: 'Walk Block B',
        kind: 'INVITE',
        at: '2026-10-16T10:00:00.000Z',
        tone: 'plum',
        needsResponse: true,
      ),
    ]));

    await tester.tap(find.byKey(const Key('day-2026-10-16')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('accept-pill')), findsOneWidget);
  });

  testWidgets('a source chip narrows the view and the band follows', (tester) async {
    await pumpCalendar(tester, agenda(items: [
      item(title: 'A task', kind: 'TASK', at: '2026-10-14T10:00:00.000Z', tone: 'warn'),
      item(title: 'A visit', kind: 'SITE_VISIT', at: '2026-10-14T14:00:00.000Z', tone: 'good'),
    ]));

    await tester.tap(find.byKey(const Key('day-2026-10-14')));
    await tester.pumpAndSettle();
    expect(find.text('A task'), findsOneWidget);
    expect(find.text('A visit'), findsOneWidget);

    await tester.tap(find.widgetWithText(Row, 'Task').first);
    await tester.pumpAndSettle();
    expect(find.text('A task'), findsOneWidget);
    expect(find.text('A visit'), findsNothing);
  });

  testWidgets('an empty day says so rather than showing nothing at all', (tester) async {
    await pumpCalendar(tester, agenda(items: const []));
    await tester.tap(find.byKey(const Key('day-2026-10-20')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing is due, scheduled or waiting on you'), findsOneWidget);
  });

  testWidgets('moving a month re-reads from the server for that month', (tester) async {
    final boundary = await pumpCalendar(tester, agenda(items: const []));
    await tester.tap(find.byTooltip('Next month'));
    await tester.pumpAndSettle();
    expect(boundary.seen.last.queryParameters['on'], startsWith('2026-11-'));
  });
}
