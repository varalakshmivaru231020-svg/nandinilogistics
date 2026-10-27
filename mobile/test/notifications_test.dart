import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/design/tokens.dart';
import 'package:nninfra/modules/notifications.dart';

import 'support.dart';

/// What needs this person.
///
/// The web has had this screen all along; the app had neither it nor any way
/// to read one, because notifications have no export route and so could not
/// come through the list endpoints. These check the screen the new endpoint
/// feeds: that an unread one is marked read where the web marks it, and that
/// tapping one lands on what it is about.

Map<String, Object> feed(List<Map<String, dynamic>> rows) => {
      '/notifications': {
        'title': 'Notifications',
        'description':
            'What needs you — escalations and anything addressed to you. Only you see these.',
        'unread': rows.where((r) => r['read'] != true).length,
        'total': rows.length,
        'rows': rows,
        'serverTime': '2026-10-15T06:00:00.000Z',
      },
    };

Map<String, dynamic> note({
  required String id,
  required String kind,
  required String title,
  String? body,
  String? href,
  bool read = false,
}) =>
    {
      'id': id,
      'kind': kind,
      'title': title,
      'body': body,
      'href': href,
      'read': read,
      'createdAt': '2026-10-14T09:00:00.000Z',
    };

Future<Boundary> pump(WidgetTester tester, Map<String, Object> routes) async {
  useEmptyPrefs();
  final b = Boundary(routes);
  await tester.pumpWidget(MaterialApp(
    theme: T.theme,
    home: NotificationsScreen(
      api: b.api,
      onBack: () {},
      bottom: const SizedBox.shrink(),
    ),
  ));
  await tester.pumpAndSettle();
  return b;
}

void main() {
  group('the list', () {
    testWidgets('counts the unread the way the web counts them', (tester) async {
      await pump(tester, feed([
        note(id: 'n1', kind: 'TASK_OVERDUE', title: 'Overdue: T-1005'),
        note(id: 'n2', kind: 'ADVANCE_APPROVED', title: 'Ravi accepted', read: true),
      ]));

      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('1 unread · 2 total'), findsOneWidget);
      expect(find.text('Overdue: T-1005'), findsOneWidget);
      // The kind, in words rather than SHOUTING_SNAKE.
      expect(find.text('TASK OVERDUE'), findsOneWidget);
    });

    testWidgets('says so plainly when nothing needs you', (tester) async {
      await pump(tester, feed(const []));
      expect(find.text('Nothing needs you'), findsOneWidget);
      expect(find.textContaining('Only you see these'), findsOneWidget);
    });

    testWidgets('shows the server\'s refusal, with a retry', (tester) async {
      await pump(tester, {
        '/notifications': const Fail(401, 'Sign in again.', 'auth'),
      });
      expect(find.text('Sign in again.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  group('marking read', () {
    testWidgets('one, by its own button', (tester) async {
      final b = await pump(tester, {
        ...feed([note(id: 'n1', kind: 'TASK_OVERDUE', title: 'Overdue: T-1005')]),
        '/do/notifications/markNotificationRead': const {'ok': true},
      });

      await tester.tap(find.text('Mark read'));
      await tester.pumpAndSettle();

      expect(b.actions.single.action, 'notifications/markNotificationRead');
      expect(b.actions.single.args, ['n1']);
    });

    testWidgets('all of them at once', (tester) async {
      final b = await pump(tester, {
        ...feed([
          note(id: 'n1', kind: 'TASK_OVERDUE', title: 'One'),
          note(id: 'n2', kind: 'TASK_ESCALATED', title: 'Two'),
        ]),
        '/do/notifications/markAllNotificationsRead': const {'ok': true},
      });

      await tester.tap(find.byTooltip('Mark all read'));
      await tester.pumpAndSettle();

      expect(b.actions.single.action, 'notifications/markAllNotificationsRead');
      expect(b.actions.single.args, isEmpty);
    });

    /// Nothing to mark means no button, as on the web.
    testWidgets('and no such button when everything is read', (tester) async {
      await pump(tester, feed([
        note(id: 'n1', kind: 'TASK_OVERDUE', title: 'One', read: true),
      ]));
      expect(find.byTooltip('Mark all read'), findsNothing);
      expect(find.text('Mark read'), findsNothing);
    });
  });

  group('tapping one', () {
    /*
     * Every row carries the route the web would open, which is what makes a
     * notification a way in rather than a dead end: it opens the record and
     * marks itself read on the way, as the web's link does.
     */
    testWidgets('opens what it is about and marks it read', (tester) async {
      final b = await pump(tester, {
        ...feed([
          note(
            id: 'n1',
            kind: 'TASK_OVERDUE',
            title: 'Overdue: T-1005',
            href: '/tasks/cmusd9imz0001ppo2vxu2h45l',
          ),
        ]),
        '/do/notifications/markNotificationRead': const {'ok': true},
        '/record/tasks/cmusd9imz0001ppo2vxu2h45l': const {
          'key': 'tasks',
          'id': 'cmusd9imz0001ppo2vxu2h45l',
          'title': 'Waterproofing — podium deck',
          'subtitle': 'T-1005',
          'pills': [],
          'sections': [],
          'collections': [],
          'actions': [],
          'serverTime': '2026-10-15T06:00:00.000Z',
        },
      });

      await tester.tap(find.text('Overdue: T-1005'));
      await tester.pumpAndSettle();

      expect(b.actions.single.action, 'notifications/markNotificationRead');
      // And it landed on the task, not on a message saying it could not.
      expect(find.text('Waterproofing — podium deck'), findsOneWidget);
    });

    /// A notification about something the phone has no screen for still marks
    /// itself read rather than doing nothing at all.
    testWidgets('marks read even where there is nothing to open', (tester) async {
      final b = await pump(tester, {
        ...feed([note(id: 'n1', kind: 'KB_PUBLISHED', title: 'A new guide', href: '/kb')]),
        '/do/notifications/markNotificationRead': const {'ok': true},
      });

      await tester.tap(find.text('A new guide'));
      await tester.pumpAndSettle();
      expect(b.actions.single.args, ['n1']);
    });
  });
}
