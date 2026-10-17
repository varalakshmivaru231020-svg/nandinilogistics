import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/pick_file.dart';
import 'package:nninfra/core/viewer.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/module_screen.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// The three things the web could do and the app could not, done in the app.
///
/// Adding an employee, attaching the challan at the gate, and a project's
/// documents — each was web-only while the boundary carried no file. These
/// drive the app's own screens: the list's create button, the record's action
/// sheet, the row's own buttons.

class _FakeFiles implements Files {
  @override
  Future<List<Upload>> pick(String field) async =>
      [Upload(field: field, name: 'scan.pdf', bytes: const [1, 2], mime: 'application/pdf')];

  @override
  Future<List<Upload>> photo(String field) async =>
      [Upload(field: field, name: 'photo.jpg', bytes: const [3, 4], mime: 'image/jpeg')];
}

/// A viewer that records what it was handed instead of opening it.
class _FakeViewer implements Viewer {
  ({String name, String? mime, int bytes})? handed;
  String? refuse;

  @override
  Future<String?> open({required String name, required List<int> bytes, String? mime}) async {
    handed = (name: name, mime: mime, bytes: bytes.length);
    return refuse;
  }
}

void main() {
  group('a new employee, from the phone', () {
    testWidgets('the list offers the web\'s drawer, photograph and all', (tester) async {
      Files.live = _FakeFiles();
      useEmptyPrefs();
      final b = Boundary({
        '/screen/hr/employees': const {
          'key': 'hr/employees',
          'href': '/hr',
          'title': 'Employees',
          'countNoun': 'employees',
          'searchPlaceholder': 'Search name, code, mobile…',
          'filters': [],
          // What `formRefsFor` sends once the create form exists.
          'forms': [
            {
              'key': 'hr/employees:create',
              'title': 'New employee',
              'submitLabel': 'Create employee',
            },
          ],
          'record': true,
        },
        '/list/hr/employees?page=1&pageSize=50': const {
          'title': 'Employees',
          'filters': 'All employees',
          'columns': [
            {'key': 'name', 'header': 'Name'},
          ],
          'rows': [
            {'id': 'e1', 'name': 'Meera Krishnan'},
          ],
          'total': 1,
          'page': 1,
          'pageSize': 50,
          'hasMore': false,
          'serverTime': '2026-10-17T06:00:00.000Z',
          'screen': {
            'rows': [
              {'id': 'e1', 'title': 'Meera Krishnan', 'meta': 'EMP-0007'},
            ],
          },
        },
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
            {'name': 'name', 'label': 'Name', 'kind': 'text', 'required': true, 'placeholder': 'Full name'},
            {'name': 'mobile', 'label': 'Mobile number', 'kind': 'phone', 'required': true},
            {'name': 'aadhaar', 'label': 'Aadhaar number', 'kind': 'text', 'required': true},
            {
              'name': 'doc:Aadhaar card',
              'label': 'Aadhaar card',
              'kind': 'files',
              'accept': 'application/pdf,image/*',
              'maxFiles': 1,
              'note': 'Aadhaar card and PAN card copies only',
            },
          ],
        },
        '/do/hr/createEmployee': const {'ok': true},
      });

      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: ModuleScreen(
          api: b.api,
          session: sessionWith(const ['hr.employee.view', 'hr.employee.create']),
          moduleKey: 'hr/employees',
          onBack: () {},
          bottom: const SizedBox.shrink(),
          onPickProject: () {},
          onOpenRelated: (_) {},
        ),
      ));
      await tester.pumpAndSettle();

      // The create button the screen grew, named in the form's own words —
      // the bar draws it as an icon carrying that name.
      final create = find.byWidgetPredicate(
        (w) => w is BarButton && w.label == 'New employee',
        description: 'the New employee button',
      );
      expect(create, findsOneWidget);
      await tester.tap(create);
      await tester.pumpAndSettle();
      expect(find.text('Name, mobile, photo and Aadhaar are mandatory'), findsOneWidget);

      // The photograph: taken here, as it is on site.
      await tester.tap(find.byKey(const Key('camera-photo')));
      await tester.pumpAndSettle();
      expect(find.textContaining('photo.jpg'), findsOneWidget);

      // And the Aadhaar copy beside it, from the phone's files.
      await tester.scrollUntilVisible(find.byKey(const Key('files-doc:Aadhaar card')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('files-doc:Aadhaar card')));
      await tester.pumpAndSettle();
      expect(find.textContaining('scan.pdf'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('field-name')), 'Phone Hire');
      await tester.enterText(find.byKey(const Key('field-mobile')), '98765 43210');
      await tester.enterText(find.byKey(const Key('field-aadhaar')), '1234 5678 9012');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      // One body: the particulars as JSON, the two files as parts under the
      // names `saveFiles()` reads them from.
      final sent = b.multipart.last;
      expect(b.actions.last.action, 'hr/createEmployee');
      expect(sent.args, [
        {'name': 'Phone Hire', 'mobile': '98765 43210', 'aadhaar': '1234 5678 9012'},
      ]);
      expect(sent.files, containsAll(<String>['photo.jpg', 'scan.pdf']));
      expect(sent.fields, containsAll(<String>['photo', 'doc:Aadhaar card']));
    });
  });

  group('the challan, at the gate', () {
    testWidgets('a photograph goes up with the receipt that is being booked', (tester) async {
      Files.live = _FakeFiles();
      useEmptyPrefs();
      final b = Boundary({
        '/record/material/purchase-orders/po1': const {
          'key': 'material/purchase-orders',
          'id': 'po1',
          'title': 'PO/NNS/2026-27/0012',
          'subtitle': 'Shree Cement',
          'pills': [],
          'sections': [],
          'collections': [],
          'actions': [
            {
              'key': 'receive',
              'label': 'Receive goods',
              'emphasis': 'primary',
              'action': 'material/grn/createGrn',
              'args': [
                {'poId': 'po1', 'storeId': r'$storeId', 'items': r'$items'},
                {'label': 'Challan'},
              ],
              'remark': 'none',
              'fields': [
                {
                  'name': 'storeId',
                  'label': 'Receiving store',
                  'kind': 'select',
                  'required': true,
                  // Already answered, as the web's own form opens it.
                  'initial': 'st1',
                  'options': [
                    {'value': 'st1', 'label': 'Main store'},
                  ],
                },
                {
                  'name': 'files',
                  'label': 'Challan / material photo',
                  'kind': 'files',
                  'camera': true,
                  'wide': true,
                },
                {
                  'name': 'items',
                  'label': 'What arrived',
                  'kind': 'rows',
                  'fixedRows': true,
                  'initialRows': [
                    {'_label': 'OPC 53 grade · 100 Bags still to come', 'poItemId': 'l1', 'receivedQty': 100},
                  ],
                  'row': [
                    {'name': 'poItemId', 'label': 'Line', 'kind': 'text', 'hidden': true},
                    {'name': 'receivedQty', 'label': 'Received', 'kind': 'number', 'required': true},
                  ],
                },
              ],
            },
          ],
          'serverTime': '2026-10-17T06:00:00.000Z',
        },
        '/do/material/grn/createGrn': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(
          api: b.api,
          module: 'material/purchase-orders',
          id: 'po1',
          fallbackTitle: 'Purchase order',
        ),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(Btn, 'Receive goods').last);
      await tester.pumpAndSettle();

      // The receiving store, as the web's own picker takes it.
      // The web's own field group, and the camera its control invites.
      expect(find.textContaining('Challan / material photo'), findsOneWidget);
      await tester.tap(find.byKey(const Key('camera-files')));
      await tester.pumpAndSettle();
      expect(find.textContaining('photo.jpg'), findsOneWidget);

      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      final sent = b.multipart.last;
      expect(b.actions.last.action, 'material/grn/createGrn');
      // The receipt as the action takes it, and the attachments beside it,
      // labelled as the web labels them.
      expect(sent.args, [
        {
          'poId': 'po1',
          'storeId': 'st1',
          'items': [
            {'poItemId': 'l1', 'receivedQty': 100},
          ],
        },
        {'label': 'Challan'},
      ]);
      expect(sent.files, ['photo.jpg']);
    });
  });

  group('a stored file, on the phone', () {
    testWidgets('a drawing is handed to whatever reads it, and a refusal is said',
        (tester) async {
      final viewer = _FakeViewer();
      Viewer.live = viewer;
      useEmptyPrefs();
      final b = Boundary({
        '/record/material/grn/g1': const {
          'key': 'material/grn',
          'id': 'g1',
          'title': 'GRN/NNS/2026-27/0007',
          'subtitle': 'Shree Cement',
          'pills': [],
          'sections': [],
          'collections': [
            {
              'key': 'files:g1',
              'label': 'Attachments · 1',
              'rows': [
                {
                  'id': 'a1',
                  'title': 'challan-4471.pdf',
                  'subtitle': 'Challan',
                  'trailing': '42 KB',
                  'file': {
                    'url': '/api/material/grn/attachments/a1',
                    'name': 'challan-4471.pdf',
                    'mime': 'application/pdf',
                  },
                  'actions': [
                    {
                      'key': 'remove',
                      'label': 'Remove',
                      'emphasis': 'reject',
                      'glyph': '🗑',
                      'action': 'material/grn/deleteGrnAttachment',
                      'args': ['a1'],
                      'remark': 'none',
                      'confirm': 'The file goes with it.',
                    },
                  ],
                },
              ],
            },
          ],
          'actions': [],
          'serverTime': '2026-10-17T06:00:00.000Z',
        },
        '/do/material/grn/deleteGrnAttachment': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(api: b.api, module: 'material/grn', id: 'g1', fallbackTitle: 'Receipt'),
      ));
      await tester.pumpAndSettle();

      final down = find
          .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
          .first;
      await tester.scrollUntilVisible(find.byKey(const Key('file:a1')), 300, scrollable: down);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('file:a1')));
      await tester.pumpAndSettle();

      // Fetched through the web's own route, with this session.
      expect(b.fetched.last, '/api/material/grn/attachments/a1');

      await tester.tap(find.byKey(const Key('open-file')));
      await tester.pumpAndSettle();
      // Handed over as it was stored — not described as something that "opens
      // on the web", which is what the app used to say of a PDF.
      expect(viewer.handed?.name, 'challan-4471.pdf');
      expect(viewer.handed?.mime, 'image/png'); // what the fake route serves
      expect(viewer.handed!.bytes, greaterThan(0));

      // And where nothing on the phone reads it, the phone says so.
      viewer.refuse = 'No app on this phone opens application/pdf file.';
      await tester.tap(find.byKey(const Key('open-file')));
      await tester.pumpAndSettle();
      expect(find.textContaining('No app on this phone opens'), findsOneWidget);

      // Close the sheet and remove the attachment, which the web's own card
      // offers beside each file.
      await tester.tapAt(const Offset(200, 60));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('row:a1:remove')), 300,
          scrollable: down);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('row:a1:remove')));
      await tester.pumpAndSettle();
      expect(find.text('The file goes with it.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(b.actions.last.action, 'material/grn/deleteGrnAttachment');
      expect(b.actions.last.args, ['a1']);
    });
  });
}
