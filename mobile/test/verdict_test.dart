import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/pick_file.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// Judging a checklist point, with the photographs the web collects.
///
/// The web's verdict box is a remark, a file input that accepts `image/*,.pdf`,
/// and the verdict button — one body, posted to an action that takes
/// `(itemId, formData)`. On site the photograph does not exist yet, so the
/// phone offers its camera beside the chooser; everything else is the web's.

/// A camera and a chooser that answer with one file each.
class _FakeFiles implements Files {
  @override
  Future<List<Upload>> pick(String field) async =>
      [Upload(field: field, name: 'old-snap.jpg', bytes: const [1, 2], mime: 'image/jpeg')];

  @override
  Future<List<Upload>> photo(String field) async =>
      [Upload(field: field, name: 'photo-20261017-094500.jpg', bytes: const [3, 4], mime: 'image/jpeg')];
}

Map<String, Object> _task() => {
      'key': 'tasks',
      'id': 't1',
      'title': 'Slab shuttering check',
      'subtitle': 'T-9001 · NNS',
      'pills': const [],
      'sections': const [],
      'collections': [
        {
          'key': 'checklist:c1',
          'label': 'Column casting QC · 0 of 1 approved',
          'rows': const [
            {
              'id': 'i2',
              'badge': {'text': '01', 'tone': 'draft'},
              'title': 'Cover blocks placed',
              'actions': [
                {
                  'key': 'pass',
                  'label': 'Approve',
                  'emphasis': 'approve',
                  'action': 'tasks/reviewChecklistItem',
                  'args': ['i2', r'$values'],
                  'parts': {'verdict': 'APPROVE'},
                  'fields': [
                    {
                      'name': 'files',
                      'label': 'Photographs',
                      'kind': 'files',
                      'accept': 'image/*,.pdf',
                      'note': 'The remark and the photographs are both optional.',
                    },
                  ],
                  'remark': 'optional',
                  'remarkLabel': 'Remark',
                  'remarkPlaceholder': 'A remark, if you have one (optional)',
                  'confirm': 'This point moves to the next level.',
                },
              ],
            },
          ],
        },
      ],
      'actions': const [],
      'serverTime': '2026-10-17T06:00:00.000Z',
    };

Future<Boundary> _open(WidgetTester tester) async {
  Files.live = _FakeFiles();
  useEmptyPrefs();
  final b = Boundary({
    '/record/tasks/t1': _task(),
    '/do/tasks/reviewChecklistItem': const {'ok': true},
  });
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: RecordScreen(api: b.api, module: 'tasks', id: 't1', fallbackTitle: 'Task'),
  ));
  await tester.pumpAndSettle();

  final down = find
      .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
      .first;
  await tester.scrollUntilVisible(find.byKey(const Key('row:i2:pass')), 300, scrollable: down);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('row:i2:pass')));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('the verdict box on the phone', () {
    testWidgets('offers the camera and the chooser, in the web\'s own words', (tester) async {
      await _open(tester);

      expect(find.text('This point moves to the next level.'), findsOneWidget);
      expect(find.text('Take a photo'), findsOneWidget);
      expect(find.text('Choose a file'), findsOneWidget);
      // The web's small print under its own file input, and its placeholder.
      expect(
        find.textContaining('The remark and the photographs are both optional.'),
        findsOneWidget,
      );
      // The placeholder is the box's own grey text, as the web's is.
      expect(
        find.byWidgetPredicate((w) =>
            w is TextField && w.decoration?.hintText == 'A remark, if you have one (optional)'),
        findsOneWidget,
      );
    });

    testWidgets('a photograph taken now goes up with the verdict and the remark',
        (tester) async {
      final b = await _open(tester);

      await tester.tap(find.byKey(const Key('camera-files')));
      await tester.pumpAndSettle();
      // Named on screen once it is held, as the web names what it has picked.
      expect(find.textContaining('photo-20261017-094500.jpg'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('remark')), 'Cover blocks at 25 mm.');
      await tester.tap(find.widgetWithText(Btn, 'Approve').last);
      await tester.pumpAndSettle();

      /*
       * One multipart request: the arguments as the action takes them, the
       * verdict and the remark in the body beside them, and the photograph as
       * a part named `files` — which is the field `filesFrom()` reads.
       */
      final sent = b.multipart.last;
      expect(b.actions.last.action, 'tasks/reviewChecklistItem');
      expect(sent.args, [
        'i2',
        {'verdict': 'APPROVE', 'remark': 'Cover blocks at 25 mm.'},
      ]);
      expect(sent.fields, contains('files'));
      expect(sent.files, ['photo-20261017-094500.jpg']);
      // The field itself sends no value of its own beside the file.
      expect(sent.args[1], isNot(contains('files')));
    });

    testWidgets('an image already on the phone goes up the same way', (tester) async {
      final b = await _open(tester);

      await tester.tap(find.byKey(const Key('files-files')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Btn, 'Approve').last);
      await tester.pumpAndSettle();

      final sent = b.multipart.last;
      expect(sent.files, ['old-snap.jpg']);
      // No remark typed: the body carries the verdict alone, as a browser
      // leaves an empty box out.
      expect(sent.args, [
        'i2',
        {'verdict': 'APPROVE'},
      ]);
    });
  });
}
