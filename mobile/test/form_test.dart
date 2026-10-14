import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/form_screen.dart';

import 'support.dart';

/// Making something.
///
/// The app could read every list and open every record but could not create
/// anything at all. A form is neither a list nor a record: it is a set of
/// fields, and rather than thirty hand-written copies — which is how the
/// filters came to be wrong in thirty different ways — the boundary sends each
/// one. These check that what it sends is what is drawn, and that what is
/// typed reaches the action in the shape the action takes.

Map<String, dynamic> field(
  String name,
  String label,
  String kind, {
  bool required = false,
  String? hint,
  String? note,
  String? placeholder,
  List<Map<String, String>>? options,
  bool caps = false,
  Object? initial,
  Map<String, dynamic>? variant,
  List<Map<String, dynamic>>? row,
  String? addLabel,
  int? minRows,
  String? minRowsMessage,
  String? leadWith,
}) =>
    {
      'name': name, 'label': label, 'kind': kind,
      if (required) 'required': true,
      if (hint != null) 'hint': hint,
      if (note != null) 'note': note,
      if (placeholder != null) 'placeholder': placeholder,
      if (options != null) 'options': options,
      if (caps) 'caps': true,
      if (initial != null) 'initial': initial,
      if (variant != null) 'variant': variant,
      if (row != null) 'row': row,
      if (addLabel != null) 'addLabel': addLabel,
      if (minRows != null) 'minRows': minRows,
      if (minRowsMessage != null) 'minRowsMessage': minRowsMessage,
      if (leadWith != null) 'leadWith': leadWith,
    };

Map<String, Object> customerForm() => {
      '/form/sales/customers/create': {
        'key': 'sales/customers:create',
        'module': 'sales/customers',
        'title': 'New customer',
        'description': 'PAN is required before KYC can be verified.',
        'submitLabel': 'Create customer',
        'action': 'sales/bookings/createCustomer',
        'shape': {'kind': 'formData'},
        'done': 'Customer created.',
        'fields': [
          field('name', 'Name', 'text', required: true),
          field('phone', 'Phone', 'phone', required: true),
          field('email', 'Email', 'email'),
          field('panNumber', 'PAN', 'text', placeholder: 'ABCDE1234F', caps: true),
          field('addressLine', 'Address', 'textarea'),
        ],
      },
      '/do/sales/bookings/createCustomer': const {'id': 'c1'},
    };

Future<Boundary> pumpForm(
  WidgetTester tester,
  Map<String, Object> routes,
  String key, {
  String? recordId,
}) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: FormScreen(api: b.api, formKey: key, recordId: recordId),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('the web\'s own form, drawn from the server', () {
    testWidgets('its title, its description and every field', (tester) async {
      await pumpForm(tester, customerForm(), 'sales/customers:create');

      expect(find.text('New customer'), findsOneWidget);
      expect(find.text('PAN is required before KYC can be verified.'), findsOneWidget);
      expect(find.text('Create customer'), findsOneWidget);
      // Required fields are marked, as the web marks them.
      expect(find.text('Name *'), findsOneWidget);
      expect(find.text('Phone *'), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('PAN'), findsOneWidget);
      expect(find.text('Address'), findsOneWidget);
    });

    testWidgets('submits every field in one object, as the action takes it',
        (tester) async {
      final b = await pumpForm(tester, customerForm(), 'sales/customers:create');

      await tester.enterText(find.byKey(const Key('field-name')), 'Lakshmi Rao');
      await tester.enterText(find.byKey(const Key('field-phone')), '9845012345');
      await tester.enterText(find.byKey(const Key('field-panNumber')), 'abcde1234f');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(b.actions.single.action, 'sales/bookings/createCustomer');
      final sent = b.actions.single.args.single as Map;
      expect(sent['name'], 'Lakshmi Rao');
      expect(sent['phone'], '9845012345');
      // The web's PAN field upper-cases as it is typed; so does this one.
      expect(sent['panNumber'], 'ABCDE1234F');
      // Nothing was typed in these, and an empty string is not an answer.
      expect(sent.containsKey('email'), isFalse);
      expect(sent.containsKey('addressLine'), isFalse);
    });

    testWidgets('a missing required field is named, and nothing is sent',
        (tester) async {
      final b = await pumpForm(tester, customerForm(), 'sales/customers:create');

      await tester.enterText(find.byKey(const Key('field-name')), 'Lakshmi Rao');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(find.text('Phone is required.'), findsOneWidget);
      expect(b.actions, isEmpty);
    });

    /// The server's refusal, in the server's own words.
    testWidgets('a refusal is shown as the server worded it', (tester) async {
      await pumpForm(tester, {
        ...customerForm(),
        '/do/sales/bookings/createCustomer':
            const Fail(400, 'Customer name is required', 'invalid'),
      }, 'sales/customers:create');

      await tester.enterText(find.byKey(const Key('field-name')), 'L');
      await tester.enterText(find.byKey(const Key('field-phone')), '98450');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(find.text('Customer name is required'), findsOneWidget);
      expect(find.text('Refused by invalid'), findsOneWidget);
    });
  });

  group('a checkbox, and the fields that change with it', () {
    Map<String, Object> calendarForm() => {
          '/form/calendar/create': {
            'key': 'calendar:create',
            'module': 'calendar',
            'title': 'New calendar task',
            'submitLabel': 'Add to my calendar',
            'action': 'calendar/createCalendarTask',
            'shape': {'kind': 'formData'},
            'fields': [
              field('title', 'Title', 'text', required: true),
              field('allDay', 'Runs all day', 'checkbox'),
              field('startAt', 'Starts', 'datetime',
                  required: true,
                  variant: {'whenField': 'allDay', 'label': 'First day', 'kind': 'date'}),
              field('attendeeIds', 'On whom', 'multi',
                  note: 'they accept before it is theirs',
                  placeholder: 'Search people…',
                  options: [
                    {'value': 'u2', 'label': 'Ravi Shankar', 'hint': 'Site Engineer'},
                    {'value': 'u3', 'label': 'Girish Patil', 'hint': 'Store Keeper'},
                  ]),
            ],
          },
          '/do/calendar/createCalendarTask': const {'id': 'e1'},
        };

    /// "Starts" is "First day" once it runs all day, and takes a day rather
    /// than an instant — which is what the action reads.
    testWidgets('ticking it renames the field it governs', (tester) async {
      await pumpForm(tester, calendarForm(), 'calendar:create');

      expect(find.text('Starts *'), findsOneWidget);
      expect(find.text('First day *'), findsNothing);

      await tester.tap(find.text('Runs all day'));
      await tester.pumpAndSettle();

      expect(find.text('First day *'), findsOneWidget);
      expect(find.text('Starts *'), findsNothing);
    });

    /// A browser sends a ticked box as "on" and leaves it out otherwise. Every
    /// one of these actions reads it that way, so the phone has to send it so.
    testWidgets('is sent as "on", and left out when it is not ticked',
        (tester) async {
      final b = await pumpForm(tester, calendarForm(), 'calendar:create');

      await tester.enterText(find.byKey(const Key('field-title')), 'Site walk');
      await tester.tap(find.text('Runs all day'));
      await tester.pumpAndSettle();
      // The day, through the picker the design asks for rather than typed text.
      await tester.tap(find.text('Pick a date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      final sent = b.actions.single.args.single as Map;
      expect(sent['allDay'], 'on');
      expect(sent['title'], 'Site walk');
      // A day, not an instant — the action slices the first ten characters.
      expect(sent['startAt'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    });

    testWidgets('the people it goes on are picked by search, in order',
        (tester) async {
      final b = await pumpForm(tester, calendarForm(), 'calendar:create');

      // The web's small print travels with the label.
      expect(find.textContaining('they accept before it is theirs'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('field-title')), 'Site walk');
      await tester.tap(find.text('Pick a date and time'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      // The time picker that follows a datetime field.
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Search people…'));
      await tester.pumpAndSettle();
      // The hint under each name is searchable, as it is on the web.
      await tester.enterText(find.byKey(const Key('search-options')), 'store');
      await tester.pumpAndSettle();
      expect(find.text('Ravi Shankar'), findsNothing);
      await tester.tap(find.byKey(const Key('option-u3')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      final sent = b.actions.single.args.single as Map;
      expect(sent['attendeeIds'], ['u3']);
      /*
       * Sent with the phone's own offset on it. A server keeping UTC time
       * reads bare "10:00" as 10:00 UTC — half past three in the afternoon
       * here — and the appointment lands on the wrong hour.
       */
      expect(sent['startAt'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$')));
    });
  });

  group('a document with lines', () {
    Map<String, Object> indentForm() => {
          '/form/material/indents/create': {
            'key': 'material/indents:create',
            'module': 'material/indents',
            'title': 'New indent',
            'submitLabel': 'Save draft',
            'action': 'material/indents/createIndent',
            // The action takes a parsed object and a submit flag.
            'shape': {'kind': 'positional', 'order': [r'$values', false]},
            'fields': [
              field('projectId', 'Project', 'select', required: true, options: [
                {'value': 'p1', 'label': 'NNS — NN Skyline'},
              ]),
              field('requiredByDate', 'Required by', 'date', required: true),
              field('items', 'Items', 'rows',
                  addLabel: 'Add item',
                  minRows: 1,
                  minRowsMessage: 'Add at least one item',
                  row: [
                    field('itemId', 'Item', 'lookup', required: true, options: [
                      {'value': 'i1', 'label': 'OPC 53 Grade Cement', 'hint': 'CEM-001 · BAG'},
                    ]),
                    field('requestedQty', 'Quantity', 'number', required: true),
                  ]),
            ],
          },
          '/do/material/indents/createIndent': const {'id': 'x1', 'indentNo': 'IND/NNS/2026-27/9009'},
        };

    testWidgets('one line is there to fill, and more can be added',
        (tester) async {
      await pumpForm(tester, indentForm(), 'material/indents:create');

      expect(find.text('LINE 1'), findsOneWidget);
      expect(find.text('Add item'), findsOneWidget);

      // A form taller than the handset: the button has to be on screen before
      // it can be pressed, here as on a phone.
      await tester.ensureVisible(find.text('Add item'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add item'));
      await tester.pumpAndSettle();
      expect(find.text('LINE 2'), findsOneWidget);

      // The first line cannot be removed — the action will not take none.
      expect(find.text('Remove'), findsNWidgets(2));
      await tester.tap(find.text('Remove').last);
      await tester.pumpAndSettle();
      expect(find.text('LINE 2'), findsNothing);
    });

    testWidgets('the lines go inside the object the action parses',
        (tester) async {
      final b = await pumpForm(tester, indentForm(), 'material/indents:create');

      await tester.tap(find.text('NNS — NN Skyline'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pick a date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('option-i1')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('field-requestedQty')), '120');
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(b.actions.single.action, 'material/indents/createIndent');
      final args = b.actions.single.args;
      final input = args.first as Map;
      expect(input['projectId'], 'p1');
      expect(input['items'], [
        {'itemId': 'i1', 'requestedQty': 120}
      ]);
      // The second argument is the literal the server named: not submitted yet.
      expect(args[1], false);
    });

    testWidgets('an empty line is caught in the line\'s own words',
        (tester) async {
      final b = await pumpForm(tester, indentForm(), 'material/indents:create');

      await tester.tap(find.text('NNS — NN Skyline'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pick a date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      expect(find.text('Item is required.'), findsOneWidget);
      expect(b.actions, isEmpty);
    });
  });

  group('review levels', () {
    /// Review level 1 is the assignee, and the action reads the list in level
    /// order — so whoever the assignee field names is sent first.
    testWidgets('the reviewers are led by the assignee', (tester) async {
      final b = await pumpForm(tester, {
        '/form/tasks/create': {
          'key': 'tasks:create',
          'module': 'tasks',
          'title': 'New task',
          'submitLabel': 'Create task',
          'action': 'tasks/createTask',
          'shape': {'kind': 'formData'},
          'fields': [
            field('assigneeId', 'Assign to', 'lookup', required: true, options: [
              {'value': 'u2', 'label': 'Ravi Shankar'},
            ]),
            field('reviewerIds', 'Reviewers', 'multi', leadWith: 'assigneeId', options: [
              {'value': 'u4', 'label': 'Anil Deshpande'},
            ]),
          ],
        },
        '/do/tasks/createTask': const {'id': 't9'},
      }, 'tasks:create');

      await tester.tap(find.text('Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('option-u2')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('option-u4')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();

      final sent = b.actions.single.args.single as Map;
      expect(sent['reviewerIds'], ['u2', 'u4']);
    });
  });

  group('a module whose form is not described yet', () {
    testWidgets('says so, and says where it can still be done', (tester) async {
      await pumpForm(tester, {
        '/form/material/vendors/create':
            const Fail(404, 'There is no form for that yet: material/vendors/create', 'unknown-form'),
      }, 'material/vendors:create');

      expect(find.text('Not on the phone yet'), findsOneWidget);
      expect(find.textContaining('can still be created on the web'), findsOneWidget);
    });

    testWidgets('a permission refusal is not offered a retry', (tester) async {
      await pumpForm(tester, {
        '/form/sales/customers/create':
            const Fail(403, 'You do not have permission to create this.', 'forbidden'),
      }, 'sales/customers:create');

      expect(find.text('You do not have permission to create this.'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });
  });
}
