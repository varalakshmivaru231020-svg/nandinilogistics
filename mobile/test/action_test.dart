import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/approvals.dart';

import 'support.dart';

/// Does a button actually do anything.
///
/// This is the file that would have caught the first attempt. That app drew
/// thirty modules and invoked none of the 152 actions — every screen was
/// read-only and nothing was clickable, and no test said so because no test
/// asked. These ask.

Future<Boundary> pumpApprovals(
  WidgetTester tester, {
  required List<Map<String, dynamic>> rows,
  Map<String, Object> extra = const {},
  List<String> codes = const ['approvals.queue.view'],
}) async {
  useEmptyPrefs();
  final fake = Boundary({...approvalsList(rows), ...extra});
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: ApprovalsScreen(
      api: fake.api,
      session: sessionWith(codes),
      onBack: () {},
      bottom: const SizedBox(height: 56),
    ),
  ));
  await tester.pumpAndSettle();
  return fake;
}

void main() {
  group('a row you may settle offers both decisions', () {
    testWidgets('and shows the record, the value and who holds it', (tester) async {
      await pumpApprovals(tester, rows: [approvalRow()]);

      expect(find.text('IND/NNS/2026-27/9001'), findsOneWidget);
      expect(find.text('₹5.95 L'), findsOneWidget);
      expect(find.text('Project Manager'), findsOneWidget);
      expect(find.text('waiting 32 days'), findsOneWidget);
      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Reject'), findsOneWidget);
    });

    /*
     * The whole point. Approving calls the action the *server* named, with the
     * arguments the server gave — the level is "PM" because the server said so,
     * not because the app read a status string and worked it out.
     */
    testWidgets('approving calls the server\'s own action and arguments', (tester) async {
      final fake = await pumpApprovals(
        tester,
        rows: [approvalRow()],
        extra: {'/do/material/indents/approveIndent': const {'ok': true}},
      );

      await tester.tap(find.text('Approve'));
      await tester.pumpAndSettle();
      // A sheet that says what will happen, not "are you sure".
      expect(find.text('Approve IND/NNS/2026-27/9001'), findsOneWidget);
      expect(find.textContaining('clears the step it is waiting at'), findsOneWidget);

      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(fake.actions, hasLength(1));
      expect(fake.actions.single.action, 'material/indents/approveIndent');
      // id, level, then the remark the sheet collected — empty, being optional.
      expect(fake.actions.single.args, ['i1', 'PM', '']);
    });

    testWidgets('the remark reaches the server when one is typed', (tester) async {
      final fake = await pumpApprovals(
        tester,
        rows: [approvalRow()],
        extra: {'/do/material/indents/approveIndent': const {'ok': true}},
      );

      await tester.tap(find.text('Approve'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('remark')), 'Pour date confirmed.');
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(fake.actions.single.args.last, 'Pour date confirmed.');
    });

    /* A refusal always says why, so the remark is not optional on that side. */
    testWidgets('rejecting will not go through without a reason', (tester) async {
      final fake = await pumpApprovals(
        tester,
        rows: [approvalRow()],
        extra: {'/do/material/indents/rejectIndent': const {'ok': true}},
      );

      await tester.tap(find.text('Reject'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(find.text('A remark is required for this.'), findsOneWidget);
      expect(fake.actions, isEmpty);

      await tester.enterText(find.byKey(const Key('remark')), 'Rates are stale.');
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(fake.actions.single.action, 'material/indents/rejectIndent');
      expect(fake.actions.single.args, ['i1', 'Rates are stale.']);
    });

    /*
     * The server's sentence, verbatim. It names the permission or the state
     * that stopped this; wording it ourselves would lose that, and the person
     * would have nothing to take to an administrator.
     */
    testWidgets('a refusal from the server is shown in its own words', (tester) async {
      final fake = await pumpApprovals(
        tester,
        rows: [approvalRow()],
        extra: {
          '/do/material/indents/approveIndent': const Fail(
            403,
            'This value (₹5,95,000) is above your approval limit of ₹5,00,000. '
                'It must go to the next level.',
            'material.indent.approvePm',
          ),
        },
      );

      await tester.tap(find.text('Approve'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm')));
      await tester.pumpAndSettle();

      expect(find.textContaining('above your approval limit'), findsOneWidget);
      expect(find.textContaining('material.indent.approvePm'), findsOneWidget);
      // The sheet stays open, because the decision was not made.
      expect(find.byKey(const Key('confirm')), findsOneWidget);
      expect(fake.actions, hasLength(1));
    });
  });

  group('a row you may not settle offers nothing to press', () {
    testWidgets('no buttons when it is waiting on somebody else', (tester) async {
      await pumpApprovals(tester, rows: [
        approvalRow(canDecide: false, waitingOn: 'Owner / Admin'),
      ]);
      expect(find.text('Approve'), findsNothing);
      expect(find.text('Reject'), findsNothing);
      expect(find.text('Waiting on someone else'), findsOneWidget);
    });

    /*
     * A checklist point is settled point by point on the task, so the server
     * sends no decision at all and the row becomes a way in rather than a pair
     * of buttons.
     */
    testWidgets('a link when it is settled on its own screen', (tester) async {
      await pumpApprovals(tester, rows: [
        approvalRow(kind: 'Checklist review', canDecide: false, decide: null, value: null),
      ]);
      expect(find.text('Approve'), findsNothing);
      expect(find.text('Open →'), findsOneWidget);
      expect(find.textContaining('point by point'), findsOneWidget);
    });

    /*
     * Some steps have no refusal — a purchase order is cancelled rather than
     * rejected. One button, not a greyed-out second one.
     */
    testWidgets('one button where the step has no refusal', (tester) async {
      await pumpApprovals(tester, rows: [
        approvalRow(
          kind: 'Transfer',
          decide: const {
            'approve': 'material/transfers/approveTransfer',
            'approveArgs': ['t1'],
            'reject': null,
            'rejectArgs': [],
            'remarkRequired': false,
          },
        ),
      ]);
      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Reject'), findsNothing);
    });
  });

  group('the queue itself', () {
    testWidgets('filters by kind, with counts on the chips', (tester) async {
      await pumpApprovals(tester, rows: [
        approvalRow(reference: 'IND/1'),
        approvalRow(reference: 'IND/2'),
        approvalRow(kind: 'Vendor invoice', reference: 'BM/4471', canDecide: false, decide: null),
      ]);

      expect(find.text('All'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);

      await tester.tap(find.text('Vendor invoice').first);
      await tester.pumpAndSettle();
      expect(find.text('BM/4471'), findsOneWidget);
      expect(find.text('IND/1'), findsNothing);
    });

    testWidgets('says so when nothing is waiting', (tester) async {
      await pumpApprovals(tester, rows: []);
      expect(find.text('Nothing is waiting on you'), findsOneWidget);
    });

    testWidgets('shows the server\'s refusal for the list itself', (tester) async {
      useEmptyPrefs();
      final fake = Boundary({
        '/list/approvals': const Fail(
            403, 'You do not have permission to see that list (approvals.queue.view).', 'approvals.queue.view'),
      });
      await tester.pumpWidget(MaterialApp(
        home: ApprovalsScreen(
          api: fake.api,
          session: sessionWith(const []),
          onBack: () {},
          bottom: const SizedBox(height: 56),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('approvals.queue.view'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });
}
