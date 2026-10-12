import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/modules.dart';
import 'package:nninfra/screens/calendar_screen.dart';
import 'package:nninfra/screens/home.dart';
import 'package:nninfra/screens/list_screen.dart';
import 'package:nninfra/screens/sign_in.dart';
import 'package:nninfra/session.dart';
import 'package:nninfra/theme.dart';

import 'support.dart';

/// Usability, asserted rather than eyeballed.
///
/// This app is used one-handed, outdoors, on a cheap handset, by somebody
/// standing on a slab — often with the system font turned up. So the things
/// below are not polish: a 32px button that cannot be hit, or a number that
/// disappears under a large font, is the screen not working.

/// WCAG relative luminance.
double _luminance(Color c) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

double contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  final hi = math.max(la, lb);
  final lo = math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('colour is legible, not just pretty', () {
    /*
     * 4.5:1 is the AA threshold for body text. These pairs are the ones the app
     * actually puts text on, taken from the web's tokens — if one of them fails
     * it fails on the web too, and the fix belongs in both.
     */
    const bodyPairs = <String, (Color, Color)>{
      'ink on page': (T.ink, T.bg),
      'ink on card': (T.ink, T.surface),
      'navy heading on card': (T.navy, T.surface),
      'white on navy bar': (Colors.white, T.navy),
      'bad on its tint': (T.bad, T.badBg),
      'good on its tint': (T.good, T.goodBg),
      'warn on its tint': (T.warn, T.warnBg),
      'plum on its tint': (T.plum, T.plumBg),
      'brand ink on its tint': (T.brandInk, T.brandBg),
    };

    for (final entry in bodyPairs.entries) {
      test('${entry.key} clears 4.5:1', () {
        final ratio = contrast(entry.value.$1, entry.value.$2);
        expect(ratio, greaterThanOrEqualTo(4.5),
            reason: '${entry.key} is ${ratio.toStringAsFixed(2)}:1');
      });
    }

    /*
     * The muted greys carry labels and secondary lines, not body text, so they
     * are held to 3:1 — the large-text and non-text threshold. Anything below
     * that is decoration pretending to be information.
     */
    test('muted label text clears 3:1', () {
      expect(contrast(T.muted, T.surface), greaterThanOrEqualTo(3.0));
      expect(contrast(T.muted, T.bg), greaterThanOrEqualTo(3.0));
    });

    /*
     * A known shortfall, inherited from the web rather than introduced here:
     * the primary button is `--color-brand-500` (#0089C9) with white text on
     * both, which is 3.87:1 — short of the 4.5:1 that 15.5px bold text needs.
     *
     * It is pinned rather than quietly tolerated. The fix is one token on both
     * sides: `--color-brand-600` (#0678AE) is already the web button's hover
     * colour and clears AA at 4.88:1. Changing it here alone would make the app
     * and the web different blues, so it waits for the web.
     */
    test('the primary button is the web\'s blue, and is still short of AA', () {
      final ratio = contrast(Colors.white, T.brand);
      expect(ratio, closeTo(3.87, 0.01),
          reason: 'if this moved, the brand token changed — check the web too');
      expect(ratio, lessThan(4.5));
      // What it would become.
      expect(contrast(Colors.white, const Color(0xFF0678AE)), greaterThanOrEqualTo(4.5));
    });

    test('a border is visible against what it sits on', () {
      expect(contrast(T.border, T.surface), greaterThan(1.1));
      expect(contrast(T.borderStrong, T.surface), greaterThan(1.2));
    });
  });

  group('everything can be hit with a thumb', () {
    /*
     * 44px is the smallest target a standing adult hits reliably, and it is
     * what both platform guidelines settle on. Measured on the real widgets,
     * because a style constant says nothing about what got rendered.
     */
    Future<void> checkTargets(WidgetTester tester, Finder finder, String what) async {
      final sizes = finder.evaluate().map((e) => tester.getSize(find.byWidget(e.widget)));
      expect(sizes, isNotEmpty, reason: 'found no $what to measure');
      for (final size in sizes) {
        expect(math.min(size.width, size.height), greaterThanOrEqualTo(44.0),
            reason: '$what is ${size.width}×${size.height}');
      }
    }

    testWidgets('on the sign-in screen', (tester) async {
      useEmptyPrefs();
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: SignInScreen(auth: Auth(FakeBoundary(const {}).api), onSignedIn: (_) {}),
      ));
      await tester.pumpAndSettle();
      await checkTargets(tester, find.byKey(const Key('submit')), 'the sign-in button');
      await checkTargets(tester, find.byType(IconButton), 'an icon button');
    });

    testWidgets('on a calendar square — a whole day has to be tappable', (tester) async {
      final boundary = FakeBoundary({
        '/calendar': {
          'view': 'month',
          'grid': List.generate(42, (i) {
            final d = DateTime(2026, 9, 28).add(Duration(days: i));
            return '${d.year}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}';
          }),
          'items': const [],
          'counts': const {},
          'tally': const {'total': 0, 'overdue': 0, 'needsResponse': 0},
          'serverTime': '2026-10-10T12:00:00.000Z',
        },
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: CalendarScreen(api: boundary.api, session: sessionWith(['calendar.agenda.view'])),
      ));
      await tester.pumpAndSettle();

      final square = tester.getSize(find.byKey(const Key('day-2026-10-14')));
      expect(square.height, greaterThanOrEqualTo(44.0));
      await checkTargets(tester, find.byTooltip('Next month'), 'the month arrow');
    });
  });

  group('an icon on its own always says what it is', () {
    /*
     * An unlabelled icon is unusable with a screen reader and ambiguous without
     * one. Every icon-only control carries a tooltip, which serves both.
     */
    testWidgets('on the list screen', (tester) async {
      final boundary = FakeBoundary({
        '/list/material/indents': {
          'title': 'Indents',
          'filters': '',
          'columns': const [{'key': 'a', 'header': 'A'}],
          'rows': const [],
          'summary': const [],
        },
      });
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: ListScreen(
          api: boundary.api,
          session: sessionWith(['material.indent.view']),
          module: const Module(
            label: 'Indents',
            permission: 'material.indent.view',
            icon: Icons.assignment_rounded,
            list: 'material/indents',
          ),
        ),
      ));
      await tester.pumpAndSettle();

      for (final button in find.byType(IconButton).evaluate()) {
        final widget = button.widget as IconButton;
        expect(widget.tooltip, isNotNull,
            reason: 'an icon button on the list screen has no tooltip');
        expect(widget.tooltip, isNotEmpty);
      }
    });
  });

  group('it survives a turned-up system font', () {
    /*
     * Someone who needs 200% text still has to be able to sign in. Flutter
     * reports an overflow as an exception during a test, so this fails loudly
     * rather than clipping a word and carrying on.
     */
    testWidgets('sign-in at twice the font size does not overflow', (tester) async {
      useEmptyPrefs();
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2.0)),
        child: MaterialApp(
          theme: T.theme,
          home: SignInScreen(auth: Auth(FakeBoundary(const {}).api), onSignedIn: (_) {}),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('the overview at twice the font size does not overflow', (tester) async {
      useEmptyPrefs();
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.reset);

      final boundary = FakeBoundary(const {});
      await tester.pumpWidget(MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2.0)),
        child: MaterialApp(
          theme: T.theme,
          home: HomeScreen(
            api: boundary.api,
            auth: Auth(boundary.api),
            session: sessionWith(const [], superAdmin: true),
            onSignOut: () {},
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('it fits a small phone', () {
    /*
     * 320 logical pixels is the narrowest Android phone still in use on sites.
     * A layout that needs 390 is a layout that is broken on the handset the
     * supervisor actually has.
     */
    testWidgets('sign-in at 320px wide', (tester) async {
      useEmptyPrefs();
      tester.view.physicalSize = const Size(640, 1136);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: SignInScreen(auth: Auth(FakeBoundary(const {}).api), onSignedIn: (_) {}),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('submit')), findsOneWidget);
    });
  });

  group('money reads the way it is spoken here', () {
    /*
     * Indian numbering, as `money()` does on the web. A figure shown as
     * "₹1,860,000" on the phone and "₹18.60 L" on the web is two numbers as far
     * as the person reading them is concerned.
     */
    test('uses lakh and crore', () {
      expect(money(1860000), '₹18.60 L');
      expect(money(42000000), '₹4.20 Cr');
    });

    test('leaves a small amount alone', () {
      expect(money(500), '₹500');
      expect(money(0), '₹0');
    });

    test('keeps a negative negative', () {
      expect(money(-1860000), '-₹18.60 L');
    });
  });
}
