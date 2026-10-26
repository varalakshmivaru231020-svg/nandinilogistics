import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/dial.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';

import 'support.dart';

/// Two things asked for by name: the lead pipeline as tabs with how late each
/// follow-up is, and a number that can be rung or messaged from the row it is on.

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
