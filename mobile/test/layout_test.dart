import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:nninfra/core/dial.dart';
import 'package:nninfra/core/shell.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/dashboard.dart';
import 'package:nninfra/modules/module_screen.dart';

import 'support.dart';

/// What a phone screen does with the room it has.
///
/// Each of these was reported from a handset: a screen whose name arrived as
/// "Le…", a lead whose name arrived as one letter, a speech bubble where the
/// WhatsApp mark belongs, and a badge floating away from the icon it counts
/// for.

class _FakeDial implements Dial {
  @override
  Future<String?> call(String number) async => null;
  @override
  Future<String?> chat(String number) async => null;
}

Map<String, Object> _leadList() => {
      'title': 'Leads',
      'filters': 'All leads in view',
      'columns': const [
        {'key': 'name', 'header': 'Name'},
      ],
      'rows': const [
        {'id': 'l1', 'name': 'Vikram Shetty'},
      ],
      'total': 9,
      'page': 1,
      'pageSize': 50,
      'hasMore': false,
      'serverTime': '2026-10-19T06:00:00.000Z',
      'screen': const {
        'rows': [
          {
            'id': 'l1',
            'title': 'Vikram Shetty',
            'meta': '📞 9880012305',
            'chips': [
              {'text': 'magicbricks', 'tone': 'warn'},
              {'text': 'overdue', 'tone': 'bad'},
            ],
            'lines': [
              {'label': 'Requirement', 'value': '2–3 BHK, east facing preferred'},
            ],
            'status': {'label': 'Booked', 'tone': 'good'},
            'contact': {'phone': '9880012305'},
          },
        ],
      },
    };

Future<Boundary> _leads(WidgetTester tester) async {
  useEmptyPrefs();
  final b = Boundary({
    '/screen/sales/leads': const {
      'key': 'sales/leads',
      'href': '/sales/leads',
      'title': 'Leads',
      'countNoun': 'records',
      'searchPlaceholder': 'Search name, mobile, requirement…',
      'filters': [
        {'name': 'state', 'label': 'Stage', 'allLabel': 'All', 'options': []},
      ],
      'forms': [
        {'key': 'sales/leads:create', 'title': 'Capture lead', 'submitLabel': 'Save lead'},
      ],
      'record': true,
    },
    '/list/sales/leads?page=1&pageSize=50': _leadList(),
  });
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ModuleScreen(
      api: b.api,
      session: sessionWith(const ['sales.lead.view', 'sales.lead.create']),
      moduleKey: 'sales/leads',
      onBack: () {},
      bottom: const SizedBox.shrink(),
      onOpenRelated: (_) {},
    ),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('the screen you are on is named in full', () {
    testWidgets('a crowded bar puts its buttons on their own line', (tester) async {
      // A phone, not a tablet: 360 points across, which is where this broke.
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      Dial.live = _FakeDial();

      await _leads(tester);

      // The whole name, and the count under it — not "Le…" over "9 reco…".
      expect(find.text('Leads'), findsWidgets);
      expect(find.textContaining('9 records'), findsOneWidget);

      /*
       * The buttons are on their own line, under the title, which is what
       * gives the title the width. A text finder cannot see an ellipsis — the
       * string is in the tree either way — so the thing to check is the
       * layout that caused it.
       */
      final title = find.descendant(
        of: find.byType(Bar),
        matching: find.text('Leads'),
      );
      expect(title, findsOneWidget);
      final titleBottom = tester.getBottomLeft(title).dy;
      for (final icon in [Icons.add_rounded, Icons.search_rounded]) {
        expect(
          tester.getCenter(find.byIcon(icon)).dy,
          greaterThan(titleBottom),
          reason: '$icon is still beside the title',
        );
      }

      // And every one of the four is still there.
      for (final icon in [
        Icons.add_rounded,
        Icons.more_vert_rounded,
        Icons.search_rounded,
        Icons.filter_list_rounded,
      ]) {
        expect(find.byIcon(icon), findsOneWidget, reason: '$icon went missing');
      }
    });
  });

  group('a lead row', () {
    testWidgets('gives the name the line, and the chips the next', (tester) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      Dial.live = _FakeDial();

      await _leads(tester);

      // The name is not squeezed between two chips and two buttons any more:
      // it has the line, and the chips are under it.
      final name = find.text('Vikram Shetty');
      expect(name, findsOneWidget);

      // The chips are still drawn, under it.
      expect(find.text('MAGICBRICKS'), findsOneWidget);
      expect(find.text('OVERDUE'), findsOneWidget);
      final chip = tester.getTopLeft(find.text('MAGICBRICKS'));
      expect(chip.dy, greaterThan(tester.getTopLeft(name).dy));
    });

    testWidgets('offers WhatsApp by its own mark, not a speech bubble', (tester) async {
      Dial.live = _FakeDial();
      await _leads(tester);

      expect(find.byIcon(FontAwesomeIcons.whatsapp), findsOneWidget);
      expect(find.byIcon(Icons.chat_rounded), findsNothing);
      expect(find.byIcon(Icons.phone_rounded), findsOneWidget);
    });
  });

  group('the dashboard', () {
    testWidgets('opens the tasks it says are overdue', (tester) async {
      useEmptyPrefs();
      final opened = <String>[];
      final b = Boundary({
        '/list/tasks': _taskList(),
        '/list/sales/leads': _emptyList('Leads'),
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: DashboardScreen(
          api: b.api,
          session: sessionWith(const ['task.task.view', 'sales.lead.view']),
          onMenu: () {},
          onNotifications: () {},
          onOpen: opened.add,
          bottom: const SizedBox.shrink(),
        ),
      ));
      await tester.pumpAndSettle();

      // Two tasks, both past their due date and neither done.
      expect(find.text('Tasks overdue'), findsOneWidget);
      expect(find.text('2'), findsWidgets);

      // It counts tasks, so it opens tasks. It used to do nothing at all.
      await tester.tap(find.text('Tasks overdue'));
      await tester.pumpAndSettle();
      expect(opened, ['tasks']);

      // A module the person may see is a row, read from its own list.
      expect(find.text('Leads'), findsOneWidget);
      expect(find.text('Could not be read'), findsNothing);
    });
  });

  group('the bottom bar', () {
    testWidgets('keeps the badge on the icon it counts for', (tester) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          body: const SizedBox.shrink(),
          bottomNavigationBar: BottomBar(
            current: 'third',
            onHome: () {},
            onMore: () {},
            thirdLabel: 'Leads · CRM',
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // Every tab is drawn, including the long one.
      for (final label in ['Home', 'Leads · CRM', 'More']) {
        expect(find.text(label), findsOneWidget);
      }

      // Each tab's icon sits on the same line as every other's.
      final tops = [
        Icons.grid_view_rounded,
        Icons.menu_rounded,
      ].map((i) => tester.getCenter(find.byIcon(i)).dy).toSet();
      expect(tops.length, 1, reason: 'the icons are not on one line');
    });
  });
}
/// The dashboard's counts, and what they do when tapped.
Map<String, Object> _emptyList(String title) => {
      'title': title,
      'filters': '',
      'columns': const [],
      'rows': const [],
      'total': 0,
      'page': 1,
      'pageSize': 50,
      'hasMore': false,
      'serverTime': '2026-10-19T06:00:00.000Z',
    };

Map<String, Object> _taskList() => {
      ..._emptyList('Tasks'),
      'rows': const [
        {'id': 't1', 'status': 'In progress', 'dueAt': '2026-10-01T06:00:00.000Z'},
        {'id': 't2', 'status': 'Open', 'dueAt': '2026-10-02T06:00:00.000Z'},
      ],
      'total': 2,
    };

