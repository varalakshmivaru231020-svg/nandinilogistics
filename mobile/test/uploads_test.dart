import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/pick_file.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/form_screen.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// The forms that carry a file.
///
/// An employee's photograph, an Aadhaar copy and a rider's licence were
/// all web-only while the boundary carried no file. What the app has to get
/// right now is which record a row's form is about, and that a field which
/// takes one file holds one.

class _FakeFiles implements Files {
  @override
  Future<List<Upload>> pick(String field) async =>
      [Upload(field: field, name: 'from-files.jpg', bytes: const [1], mime: 'image/jpeg')];

  @override
  Future<List<Upload>> photo(String field) async =>
      [Upload(field: field, name: 'from-camera.jpg', bytes: const [2], mime: 'image/jpeg')];
}

/// An employee record whose documents each carry their own edit and delete.
Map<String, Object> _employee() => {
      'key': 'hr/employees',
      'id': 'p1',
      'title': 'NN Skyline',
      'subtitle': 'NNS',
      'pills': const [],
      'sections': const [],
      'collections': [
        {
          'key': 'docs:p1',
          'label': 'Documents · 1',
          'rows': const [
            {
              'id': 'd1',
              'title': 'Driving licence scan',
              'subtitle': 'Licence · 2 versions · view',
              'actions': [
                {
                  'key': 'edit',
                  'label': 'Edit',
                  'emphasis': 'outline',
                  'glyph': '✎',
                  'action': '',
                  'args': [],
                  'remark': 'none',
                  'form': 'hr/employees:editDocument',
                  'formId': 'd1',
                },
              ],
            },
          ],
        },
      ],
      'actions': const [
        {
          'key': 'upload',
          'label': 'Upload',
          'emphasis': 'outline',
          'action': '',
          'args': [],
          'remark': 'none',
          'form': 'hr/employees:uploadDocument',
        },
      ],
      'serverTime': '2026-10-17T06:00:00.000Z',
    };

void main() {
  group('a row whose form is about the row', () {
    testWidgets('opens the document, not the employee', (tester) async {
      useEmptyPrefs();
      final b = Boundary({
        '/record/hr/employees/p1': _employee(),
        '/form/hr/employees/editDocument?id=d1': const {
          'key': 'hr/employees:editDocument',
          'module': 'hr/employees',
          'title': 'Edit document',
          'submitLabel': 'Save',
          'action': 'hr/[id]/documents/updateDocument',
          'shape': {'kind': 'positional', 'order': [r'$id', {'title': r'$title'}]},
          'fields': [
            {'name': 'title', 'label': 'Title', 'kind': 'text', 'required': true, 'initial': 'Driving licence scan'},
          ],
        },
        '/do/hr/[id]/documents/updateDocument': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(api: b.api, module: 'hr/employees', id: 'p1', fallbackTitle: 'Employee'),
      ));
      await tester.pumpAndSettle();

      final down = find
          .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
          .first;
      await tester.scrollUntilVisible(find.byKey(const Key('row:d1:edit')), 300, scrollable: down);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('row:d1:edit')));
      await tester.pumpAndSettle();

      // The form was fetched for the document's own id — the record's id would
      // have prefilled the form from the employee and saved onto it.
      expect(b.gets, contains('/form/hr/employees/editDocument?id=d1'));
      expect(find.text('Edit document'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('field-title')), 'Driving licence scan rev B');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'hr/[id]/documents/updateDocument');
      expect(b.actions.last.args, [
        'd1',
        {'title': 'Driving licence scan rev B'},
      ]);
    });
  });

  group('a field that takes one file', () {
    testWidgets('a second choice replaces the first, and the camera is offered', (tester) async {
      Files.live = _FakeFiles();
      useEmptyPrefs();
      final b = Boundary({
        '/form/hr/employees/create': const {
          'key': 'hr/employees:create',
          'module': 'hr/employees',
          'title': 'New employee',
          'description': 'Name, mobile, photo and Aadhaar are mandatory',
          'submitLabel': 'Create employee',
          'action': 'hr/createEmployee',
          'shape': {'kind': 'formData'},
          'fields': [
            {'name': 'photo', 'label': 'Photo', 'kind': 'files', 'accept': 'image/*', 'maxFiles': 1},
            {'name': 'name', 'label': 'Name', 'kind': 'text', 'required': true},
          ],
        },
        '/do/hr/createEmployee': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: FormScreen(api: b.api, formKey: 'hr/employees:create'),
      ));
      await tester.pumpAndSettle();

      // The web's own square takes a picture or a file; so does this.
      expect(find.text('Take a photo'), findsOneWidget);
      expect(find.text('Choose a file'), findsOneWidget);

      await tester.tap(find.byKey(const Key('camera-photo')));
      await tester.pumpAndSettle();
      expect(find.textContaining('from-camera.jpg'), findsOneWidget);

      // One photograph: choosing a file replaces the picture rather than
      // adding a second, as a single file input does.
      await tester.tap(find.byKey(const Key('files-photo')));
      await tester.pumpAndSettle();
      expect(find.textContaining('from-files.jpg'), findsOneWidget);
      expect(find.textContaining('from-camera.jpg'), findsNothing);

      await tester.enterText(find.byKey(const Key('field-name')), 'Phone Hire');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      final sent = b.multipart.last;
      expect(sent.files, ['from-files.jpg']);
      expect(sent.args, [
        {'name': 'Phone Hire'},
      ]);
    });
  });
}
