import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';

import 'support.dart';

/// Available Flats — the board, as the web paints it.
///
/// Three states and nothing else, the towers as chips, the floors stacked
/// highest first, and the filters fading what they exclude rather than removing
/// it, so a tower does not change shape as they are used.

Map<String, Object> _flat(
  String id,
  String number,
  int floor,
  String state, {
  String type = '2 BHK',
  Map<String, Object>? holder,
  List<Map<String, Object>> actions = const [],
}) =>
    {
      'id': id,
      'number': number,
      'floor': floor,
      'type': type,
      'state': state,
      'stateLabel': state == 'AVAILABLE' ? 'Available' : state == 'HELD' ? 'Held' : 'Booked',
      'summary': '$type · 1,245 sq ft · ${state == "AVAILABLE" ? "Available" : "Booked"}',
      'open': state == 'AVAILABLE' ? 'Book unit' : 'Open the flat',
      if (holder != null) 'holder': holder,
      'actions': actions,
    };

Map<String, Object> _routes() => {
      '/screen/units': const {
        'key': 'units',
        'href': '/units/board',
        'title': 'Available Flats',
        'countNoun': 'flats',
        'searchPlaceholder': 'Search unit number…',
        'filters': [],
        'dateRange': null,
        'forms': [],
        'record': true,
      },
      '/list/units?page=1&pageSize=50': {
        'title': 'Available Flats',
        'filters': '',
        'columns': const [
          {'key': 'unitNumber', 'header': 'Unit'},
        ],
        'rows': const [
          {'id': 'u1', 'unitNumber': 'A-0101'},
        ],
        'total': 1,
        'page': 1,
        'pageSize': 50,
        'hasMore': false,
        'serverTime': '2026-10-15T06:00:00.000Z',
        'screen': {
          'rows': const [
            {'id': 'u1', 'title': 'A-0101'},
          ],
          'board': {
            'project': const {'id': 'p1', 'name': 'NN Skyline'},
            'projects': const [
              {'id': 'p1', 'name': 'NN Skyline'},
            ],
            'legend': const [
              {'value': 'AVAILABLE', 'label': 'Available', 'tone': 'good'},
              {'value': 'HELD', 'label': 'Held', 'tone': 'warn'},
              {'value': 'BOOKED', 'label': 'Booked', 'tone': 'bad'},
            ],
            'filters': const [
              {'value': 'all', 'label': 'All'},
              {'value': 'AVAILABLE', 'label': 'Available'},
              {'value': 'HELD', 'label': 'Held'},
              {'value': 'BOOKED', 'label': 'Booked'},
            ],
            'types': const ['2 BHK', '3 BHK'],
            'priceList': 'Price list 1 · effective 01 Feb 2026 · holds released manually',
            'emptyTower': 'No units in this tower yet',
            'fieldSets': const {
              'hold': [
                {
                  'name': 'customerId',
                  'label': 'Hold for',
                  'kind': 'lookup',
                  'required': true,
                  'options': [
                    {'value': 'c1', 'label': 'Vikram Shetty', 'hint': '9880012305'},
                  ],
                },
              ],
            },
            'blocks': [
              {
                'id': 'b1',
                'name': 'Tower A',
                'flats': [
                  _flat('u2', 'A-0202', 2, 'AVAILABLE', actions: const [
                    {
                      'key': 'hold',
                      'label': 'Hold unit',
                      'emphasis': 'outline',
                      'action': 'sales/cost-sheets/holdUnit',
                      'args': ['u2', null, '\$customerId', '\$remarks'],
                      'remark': 'none',
                      'fieldsFrom': 'hold',
                      'confirm': 'The flat is held, and shows as Held on the board.',
                    },
                  ]),
                  _flat('u3', 'A-0201', 2, 'BOOKED',
                      type: '3 BHK',
                      holder: const {'label': 'Booked for', 'name': 'Vikram T.'}),
                  _flat('u1', 'A-0101', 1, 'HELD',
                      holder: const {'label': 'Held for', 'name': 'Priya N.'}),
                ],
              },
              {'id': 'b2', 'name': 'Tower B', 'flats': const []},
            ],
          },
        },
      },
      '/do/sales/cost-sheets/holdUnit': const {'ok': true},
    };

Future<Boundary> _pump(WidgetTester tester, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ModuleScreen(
      api: b.api,
      session: sessionWith(const ['unit.board.view', 'unit.hold.create']),
      moduleKey: 'units',
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
  group('the availability board', () {
    testWidgets('paints the towers, the legend, the chips and the flats', (tester) async {
      await _pump(tester, _routes());

      // The three states, in the web's own words.
      expect(find.text('Available'), findsWidgets);
      expect(find.text('Held'), findsWidgets);
      expect(find.text('Booked'), findsWidgets);

      // Towers as chips.
      expect(find.text('Tower A'), findsOneWidget);
      expect(find.text('Tower B'), findsOneWidget);

      // The floors, stacked — and every flat on them.
      expect(find.text('Fl 2'), findsOneWidget);
      expect(find.text('Fl 1'), findsOneWidget);
      expect(find.text('A-0202'), findsOneWidget);
      expect(find.text('A-0101'), findsOneWidget);

      // The tower's own three figures, and the price-list line under it.
      expect(find.text('On hold'), findsOneWidget);
      expect(
        find.text('Price list 1 · effective 01 Feb 2026 · holds released manually'),
        findsOneWidget,
      );
    });

    testWidgets('a filter fades what it excludes and keeps the tower whole', (tester) async {
      await _pump(tester, _routes());

      await tester.tap(find.widgetWithText(FilterChip2, 'Booked').first);
      await tester.pumpAndSettle();

      // Every flat is still on the board — the excluded ones are faded, which
      // is what the web does.
      expect(find.text('A-0202'), findsOneWidget);
      expect(find.text('A-0201'), findsOneWidget);
      final faded = tester.widget<Opacity>(
        find.ancestor(of: find.text('A-0202'), matching: find.byType(Opacity)).first,
      );
      expect(faded.opacity, lessThan(0.5));
    });

    testWidgets('a flat opens the panel, which names who holds it', (tester) async {
      await _pump(tester, _routes());

      await tester.tap(find.byKey(const Key('flat:u3')));
      await tester.pumpAndSettle();

      expect(find.text('Unit A-0201'), findsOneWidget);
      expect(find.text('BOOKED FOR'), findsOneWidget);
      expect(find.text('Vikram T.'), findsOneWidget);
      // A booked flat is not held or booked again; it opens.
      expect(find.text('Open the flat'), findsOneWidget);
    });

    testWidgets('holding a flat asks the board\'s own question and calls the action',
        (tester) async {
      final b = await _pump(tester, _routes());

      await tester.tap(find.byKey(const Key('flat:u2')));
      await tester.pumpAndSettle();
      expect(find.text('Book unit'), findsOneWidget);

      await tester.tap(find.byKey(const Key('flat-action:u2:hold')));
      await tester.pumpAndSettle();

      // The field the board sent once, not one carried on every flat.
      expect(find.textContaining('Hold for'), findsWidgets);
      // A lookup is searched, as every other lookup in the app is.
      await tester.tap(find.widgetWithText(Btn, 'Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vikram Shetty').last);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(Btn, 'Hold unit').last);
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'sales/cost-sheets/holdUnit');
      expect(b.actions.last.args.first, 'u2');
      expect(b.actions.last.args[2], 'c1');
    });
  });
}
