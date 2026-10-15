import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/pick_file.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/form_screen.dart';
import 'package:nninfra/modules/record_screen.dart';

import 'support.dart';

/// Attaching a file, and reading one back.
///
/// The boundary has always accepted multipart — what the app could not do was
/// choose a file or open a stored one. An article's attachments and a
/// customer's identity copies are both this.

/// A chooser that answers with one file, and one that is cancelled.
class _FakeFiles implements Files {
  _FakeFiles(this.answer);
  final List<Upload> answer;
  @override
  Future<List<Upload>> pick(String field) async =>
      [for (final u in answer) Upload(field: field, name: u.name, bytes: u.bytes, mime: u.mime)];
}

void main() {
  group('attaching a file to an article', () {
    testWidgets('it is chosen, named on screen, and sent as multipart', (tester) async {
      Files.live = _FakeFiles([
        const Upload(field: 'files', name: 'brochure.pdf', bytes: [1, 2, 3], mime: 'application/pdf'),
      ]);
      useEmptyPrefs();
      final b = Boundary({
        '/form/kb/create': const {
          'key': 'kb:create',
          'module': 'kb',
          'title': 'New article',
          'submitLabel': 'Publish article',
          'action': 'kb/createArticle',
          'shape': {'kind': 'formData'},
          'fields': [
            {'name': 'title', 'label': 'Name', 'kind': 'text', 'required': true},
            {'name': 'body', 'label': 'Description', 'kind': 'textarea', 'required': true},
            {
              'name': 'files',
              'label': 'Attachments',
              'kind': 'files',
              'note': 'PDF, Word, Excel, images, DWG or plain text — up to 25 MB',
            },
          ],
        },
        '/do/kb/createArticle': const {'ok': true},
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: FormScreen(api: b.api, formKey: 'kb:create'),
      ));
      await tester.pumpAndSettle();

      expect(find.text('+ Add file'), findsOneWidget);
      await tester.tap(find.byKey(const Key('files-files')));
      await tester.pumpAndSettle();

      // Named, with its size, as the web names what it has picked.
      expect(find.textContaining('brochure.pdf'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('field-title')), 'Sales pitch');
      await tester.enterText(find.byKey(const Key('field-body')), 'Everything about the pitch.');
      // The submit button sits in the screen's own footer, with its own key.
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      // It went up as a part of the request, not as a value in the body.
      expect(b.calls.map((c) => c.path), contains('/do/kb/createArticle'));
      expect(b.multipart.last.fields, contains('files'));
      expect(b.multipart.last.files, contains('brochure.pdf'));
    });
  });

  group('reading a stored document back', () {
    testWidgets('an identity copy opens, fetched with this session', (tester) async {
      useEmptyPrefs();
      final b = Boundary({
        '/record/sales/customers/c1': const {
          'key': 'sales/customers',
          'id': 'c1',
          'title': 'Vikram Shetty',
          'subtitle': 'CUST/DEMO/007',
          'pills': [],
          'sections': [],
          'collections': [
            {
              'key': 'kyc:c1',
              'label': 'Identity documents · 1',
              'rows': [
                {
                  'id': 'kyc-c1/aadhaar.png',
                  'title': 'aadhaar.png',
                  'subtitle': 'Aadhaar · by Meera Krishnan · 42 KB',
                  'file': {
                    'url': '/api/sales/customers/kyc/kyc-c1%2Faadhaar.png',
                    'name': 'aadhaar.png',
                    'mime': 'image/png',
                  },
                },
              ],
            },
          ],
          'actions': [],
          'serverTime': '2026-10-15T06:00:00.000Z',
        },
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: RecordScreen(api: b.api, module: 'sales/customers', id: 'c1', fallbackTitle: 'Customer'),
      ));
      await tester.pumpAndSettle();

      expect(find.text('aadhaar.png'), findsOneWidget);
      expect(find.text('Aadhaar · by Meera Krishnan · 42 KB'), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const Key('file:kyc-c1/aadhaar.png')), 300,
          scrollable: find
              .byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('file:kyc-c1/aadhaar.png')));
      await tester.pumpAndSettle();

      // Read through the web's own route, with the token this session holds.
      expect(b.fetched.last, '/api/sales/customers/kyc/kyc-c1%2Faadhaar.png');
      expect(find.text('aadhaar.png'), findsWidgets);
    });
  });
}
