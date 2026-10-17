import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/dial.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// Three things asked for by name: the project's tabs with their own add
/// buttons, the lead pipeline as tabs with how late each follow-up is, and a
/// number that can be rung or messaged from the row it is on.

/// A dialler that records what it was asked to open.
class _FakeDial implements Dial {
  String? called;
  String? chatted;
  String? refuse;

  @override
  Future<String?> call(String number) async {
    called = number;
    return refuse;
  }

  @override
  Future<String?> chat(String number) async {
    chatted = number;
    return refuse;
  }
}

Map<String, Object> _project() => {
      'key': 'projects/projects',
      'id': 'p1',
      'title': 'NN Skyline',
      'subtitle': 'NNS · Bengaluru',
      'pills': const [
        {'label': 'Ongoing', 'tone': 'good'},
      ],
      'tabs': const [
        {'key': 'overview', 'label': 'Overview'},
        {'key': 'wbs', 'label': 'Tasks'},
        {'key': 'team', 'label': 'Team Mapping'},
        {'key': 'docs', 'label': 'Documents'},
        {'key': 'log', 'label': 'Site Progress'},
      ],
      'sections': const [
        {
          'label': 'Project master',
          'tab': 'overview',
          'fields': [
            {'label': 'Project code', 'value': 'NNS'},
          ],
        },
      ],
      'collections': const [
        {
          'key': 'tasks:p1',
          'tab': 'wbs',
          'label': 'Tasks on this project · 1',
          'rows': [
            {
              'id': 't7',
              'title': 'Slab shuttering check',
              'subtitle': 'T-9001 · Tower B · Anil Deshpande',
              'trailing': '08 Oct 2026',
              'pills': [
                {'label': 'Started', 'tone': 'warn'},
                {'label': 'Overdue', 'tone': 'bad'},
              ],
              'opens': {'module': 'tasks', 'id': 't7'},
            },
          ],
        },
        {
          'key': 'docs:p1',
          'tab': 'docs',
          'label': 'Documents · 1',
          'rows': [
            {'id': 'd1', 'title': 'Tower B drawing', 'subtitle': 'Drawing · 2 versions'},
          ],
        },
      ],
      'actions': const [
        {
          'key': 'edit',
          'label': 'Edit project',
          'emphasis': 'outline',
          'action': '',
          'args': [],
          'remark': 'none',
          'form': 'projects/projects:edit',
        },
        {
          'key': 'newTask',
          'label': 'New task',
          'emphasis': 'outline',
          'tab': 'wbs',
          'action': '',
          'args': [],
          'remark': 'none',
          'form': 'tasks:create',
        },
        {
          'key': 'upload',
          'label': 'Upload',
          'emphasis': 'outline',
          'tab': 'docs',
          'action': '',
          'args': [],
          'remark': 'none',
          'form': 'projects/projects:uploadDocument',
        },
      ],
      'serverTime': '2026-10-17T06:00:00.000Z',
    };

Map<String, Object> _leadList({String? pipeline}) => {
      'title': 'Leads',
      'filters': 'All leads in view',
      'columns': const [
        {'key': 'name', 'header': 'Name'},
      ],
      'rows': const [
        {'id': 'l1', 'name': 'Vikram Shetty'},
      ],
      'total': 1,
      'page': 1,
      'pageSize': 50,
      'hasMore': false,
      'serverTime': '2026-10-17T06:00:00.000Z',
      'screen': {
        'rows': [
          {
            'id': 'l1',
            'title': pipeline == 'lost' ? 'Deepa Rao' : 'Vikram Shetty',
            'meta': '📞 +91 98765 43210',
            'chips': const [
              {'text': 'website', 'tone': 'info'},
              {'text': 'overdue', 'tone': 'bad'},
            ],
            'lines': const [
              {'label': 'Next follow-up', 'value': '📞 CALL · 09/10/2026 · 11:00 · overdue'},
            ],
            'status': const {'label': 'New', 'tone': 'draft'},
            'contact': const {'phone': '+91 98765 43210'},
          },
        ],
        'tabs': const {
          'param': 'pipeline',
          'options': [
            {'key': 'all', 'label': 'All', 'count': 9},
            {'key': 'new', 'label': 'New', 'count': 4},
            {'key': 'contacted', 'label': 'Contacted', 'count': 2},
            {'key': 'visit', 'label': 'Site Visit', 'count': 1},
            {'key': 'nego', 'label': 'Negotiation', 'count': 1},
            {'key': 'booked', 'label': 'Booked', 'count': 0},
            {'key': 'lost', 'label': 'Lost', 'count': 1},
          ],
        },
      },
    };

void main() {
  group('a project, tab by tab', () {
    testWidgets('shows one tab at a time, with that tab\'s own add button',
        (tester) async {
      useEmptyPrefs();
      final b = Boundary({
        '/record/projects/projects/p1': _project(),
        '/record/tasks/t7': const {
          'key': 'tasks',
          'id': 't7',
          'title': 'Slab shuttering check',
          'subtitle': 'T-9001',
          'pills': [],
          'sections': [],
          'collections': [],
          'actions': [],
          'serverTime': '2026-10-17T06:00:00.000Z',
        },
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(
          api: b.api,
          module: 'projects/projects',
          id: 'p1',
          fallbackTitle: 'Project',
        ),
      ));
      await tester.pumpAndSettle();

      // The web's five, in its order.
      for (final label in ['Overview', 'Tasks', 'Team Mapping', 'Documents', 'Site Progress']) {
        expect(find.widgetWithText(FilterChip2, label), findsOneWidget);
      }

      // Overview is open: its particulars show and the Tasks card does not.
      expect(find.text('Project master'.toUpperCase()), findsOneWidget);
      expect(find.text('Slab shuttering check'), findsNothing);
      // Its own action is there; the other tabs' are not.
      expect(find.widgetWithText(Btn, 'Edit project'), findsOneWidget);
      expect(find.widgetWithText(Btn, 'New task'), findsNothing);

      await tester.tap(find.widgetWithText(FilterChip2, 'Tasks'));
      await tester.pumpAndSettle();

      // The work assigned against it, and the overdue marker.
      expect(find.text('Slab shuttering check'), findsOneWidget);
      expect(find.text('T-9001 · Tower B · Anil Deshpande'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);
      // The particulars are no longer on top of it.
      expect(find.text('Project master'.toUpperCase()), findsNothing);
      // And this tab's button has replaced the other's.
      expect(find.widgetWithText(Btn, 'New task'), findsOneWidget);

      // The row is a link, as it is on the web.
      await tester.tap(find.byKey(const Key('open:t7')));
      await tester.pumpAndSettle();
      expect(b.gets, contains('/record/tasks/t7'));

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilterChip2, 'Documents'));
      await tester.pumpAndSettle();
      expect(find.text('Tower B drawing'), findsOneWidget);
      expect(find.widgetWithText(Btn, 'Upload'), findsOneWidget);
      expect(find.widgetWithText(Btn, 'New task'), findsNothing);
    });
  });

  group('a project with one tab', () {
    testWidgets('draws its card without a strip to choose from', (tester) async {
      useEmptyPrefs();
      // A role holding only the documents tab: the server sends no tabs at
      // all, because a strip of one chip chooses nothing.
      final one = {
        ..._project(),
        'tabs': const <Map<String, Object>>[],
        'actions': const <Map<String, Object>>[],
      };
      final b = Boundary({'/record/projects/projects/p1': one});
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(
          api: b.api,
          module: 'projects/projects',
          id: 'p1',
          fallbackTitle: 'Project',
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byType(FilterChip2), findsNothing);
      // Its particulars are still drawn, though they name a tab.
      expect(find.text('Project master'.toUpperCase()), findsOneWidget);
      expect(find.text('Tower B drawing'), findsOneWidget);
    });
  });

  group('the lead pipeline', () {
    testWidgets('is the web\'s six columns as tabs, and asks for the one tapped',
        (tester) async {
      useEmptyPrefs();
      final b = Boundary({
        '/screen/sales/leads': const {
          'key': 'sales/leads',
          'href': '/sales/leads',
          'title': 'Leads',
          'countNoun': 'leads',
          'searchPlaceholder': 'Search name, mobile, requirement…',
          'filters': [],
          'forms': [],
          'record': true,
        },
        '/list/sales/leads?page=1&pageSize=50': _leadList(),
        '/list/sales/leads?pipeline=lost&page=1&pageSize=50': _leadList(pipeline: 'lost'),
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: ModuleScreen(
          api: b.api,
          session: sessionWith(const ['sales.lead.view']),
          moduleKey: 'sales/leads',
          onBack: () {},
          bottom: const SizedBox.shrink(),
          onPickProject: () {},
          onOpenRelated: (_) {},
        ),
      ));
      await tester.pumpAndSettle();

      // The pipeline, with what each column holds — the board's own headings.
      expect(find.widgetWithText(FilterChip2, 'All 9'), findsOneWidget);
      expect(find.widgetWithText(FilterChip2, 'New 4'), findsOneWidget);
      expect(find.widgetWithText(FilterChip2, 'Site Visit 1'), findsOneWidget);
      // A column holding nothing still shows, as the web's empty column does.
      expect(find.widgetWithText(FilterChip2, 'Booked'), findsOneWidget);

      // How late the follow-up is, in the web's own word — the chip draws it
      // the way the design draws every tag.
      expect(find.text('OVERDUE'), findsOneWidget);
      expect(
        find.text('Next follow-up: 📞 CALL · 09/10/2026 · 11:00 · overdue'),
        findsOneWidget,
      );

      // The strip scrolls sideways, as the web's board does — the last column
      // is off the edge of a phone until it is dragged into view.
      await tester.scrollUntilVisible(
        find.byKey(const Key('tab-lost')),
        120,
        scrollable: find
            .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.right)
            .first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('tab-lost')));
      await tester.pumpAndSettle();

      // It asked the server for that column rather than filtering what it had.
      expect(b.gets, contains('/list/sales/leads?pipeline=lost&page=1&pageSize=50'));
      expect(find.text('Deepa Rao'), findsOneWidget);
    });

    testWidgets('rings and messages the number on the row', (tester) async {
      final dial = _FakeDial();
      Dial.live = dial;
      useEmptyPrefs();
      final b = Boundary({
        '/screen/sales/leads': const {
          'key': 'sales/leads',
          'href': '/sales/leads',
          'title': 'Leads',
          'countNoun': 'leads',
          'searchPlaceholder': 'Search…',
          'filters': [],
          'forms': [],
          'record': true,
        },
        '/list/sales/leads?page=1&pageSize=50': _leadList(),
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: ModuleScreen(
          api: b.api,
          session: sessionWith(const ['sales.lead.view']),
          moduleKey: 'sales/leads',
          onBack: () {},
          bottom: const SizedBox.shrink(),
          onPickProject: () {},
          onOpenRelated: (_) {},
        ),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('call:+91 98765 43210')));
      await tester.pumpAndSettle();
      expect(dial.called, '+91 98765 43210');
      // The row itself did not open: the buttons are their own.
      expect(b.gets.where((g) => g.startsWith('/record/')), isEmpty);

      await tester.tap(find.byKey(const Key('chat:+91 98765 43210')));
      await tester.pumpAndSettle();
      expect(dial.chatted, '+91 98765 43210');

      // A phone with no WhatsApp says so rather than doing nothing.
      dial.refuse = 'WhatsApp is not installed on this phone.';
      await tester.tap(find.byKey(const Key('chat:+91 98765 43210')));
      await tester.pumpAndSettle();
      expect(find.text('WhatsApp is not installed on this phone.'), findsOneWidget);
    });
  });
}
