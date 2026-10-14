import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/modules.dart';
import 'package:nninfra/core/shell.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';

import 'support.dart';

/// The design, asserted.
///
/// The first attempt was rejected for not looking like the canvas, and it was
/// right to be: the tokens were approximated from memory, the shell was a light
/// drawer instead of a navy one with a bottom bar, and the type ran below the
/// floor the design sets. Approximation is what this file exists to prevent —
/// every value below is quoted from `Main.dc.html` or `Components.dc.html`.

double contrast(Color a, Color b) {
  double lum(Color c) {
    double ch(double v) =>
        v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  final (hi, lo) = (math.max(lum(a), lum(b)), math.min(lum(a), lum(b)));
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('the palette is the canvas palette', () {
    test('navy, brand and the page', () {
      expect(T.navy950, const Color(0xFF191A5C));
      expect(T.navy800, const Color(0xFF2F308C));
      expect(T.brand500, const Color(0xFF0089C9));
      expect(T.brand700, const Color(0xFF0672A6));
      expect(T.brand100, const Color(0xFFE3F2FC));
      expect(T.page, const Color(0xFFF4F6FB));
      expect(T.line, const Color(0xFFE3E7F2));
    });

    /*
     * Each status is a solid, a tint and an ink — three values, not one. The
     * first attempt used the ink as the solid, which made every green button
     * the colour of green text.
     */
    test('each status has its solid, its tint and its ink', () {
      expect((T.good, T.goodTint, T.goodInk),
          (const Color(0xFF1F9D66), const Color(0xFFE4F6EC), const Color(0xFF177049)));
      expect((T.warn, T.warnTint, T.warnInk),
          (const Color(0xFFE8A13A), const Color(0xFFFDF3E7), const Color(0xFF8A5A12)));
      expect((T.bad, T.badTint, T.badInk),
          (const Color(0xFFD8494A), const Color(0xFFFCEDED), const Color(0xFFB23334)));
      expect((T.plum, T.plumTint, T.plumInk),
          (const Color(0xFF6A46C8), const Color(0xFFEFE9FC), const Color(0xFF5636A8)));
    });

    /// The canvas names this and the first attempt did not have it at all,
    /// using the lighter `muted` for second lines instead.
    test('secondary ink exists and is the canvas value', () {
      expect(T.secondary, const Color(0xFF5A6080));
    });

    test('status ink on its own tint is legible', () {
      for (final (name, ink, tint) in [
        ('good', T.goodInk, T.goodTint),
        ('warn', T.warnInk, T.warnTint),
        ('bad', T.badInk, T.badTint),
        ('plum', T.plumInk, T.plumTint),
        ('info', T.brand700, T.brand100),
        ('draft', T.draftInk, T.draftTint),
      ]) {
        expect(contrast(ink, tint), greaterThanOrEqualTo(4.5), reason: name);
      }
    });

    test('the body and secondary inks are legible on card and page', () {
      for (final bg in [T.card, T.page]) {
        expect(contrast(T.ink, bg), greaterThanOrEqualTo(4.5));
        expect(contrast(T.secondary, bg), greaterThanOrEqualTo(4.5));
      }
    });

    test('white is legible on the navy bar and the drawer', () {
      expect(contrast(Colors.white, T.navy950), greaterThanOrEqualTo(4.5));
      expect(contrast(T.onNavySecondary, T.navy950), greaterThanOrEqualTo(4.5));
    });
  });

  group('the type scale has a floor', () {
    /*
     * "Body never goes below 14sp, captions never below 12sp." The first
     * attempt set list rows at 13 and captions at 9.5.
     */
    test('body is 14 and the row title is 16', () {
      expect(T.body().fontSize, 14);
      expect(T.rowTitle().fontSize, 16);
      expect(T.secondaryText().fontSize, 13);
      expect(T.caption().fontSize, 12);
    });

    test('the screen title and the section are Sora at the canvas sizes', () {
      expect(T.screenTitle().fontSize, 19);
      expect(T.section().fontSize, 15);
      expect(T.display().fontSize, 26);
    });

    /// Every number, so a column of money does not wobble down a list.
    test('numbers are tabular wherever they are set', () {
      for (final style in [T.num(14), T.metric(20)]) {
        expect(style.fontFeatures, contains(const FontFeature.tabularFigures()));
      }
    });
  });

  group('shape and space', () {
    test('are the canvas scale', () {
      expect(T.rButton, 8);
      expect(T.rControl, 9);
      expect(T.rCard, 13);
      expect(T.gutter, 16);
      expect(T.cardPad, 16);
      expect(T.cardGap, 12);
      expect(T.target, 48);
    });
  });

  group('every control clears the 48dp target', () {
    Future<void> targets(WidgetTester tester, Finder finder, String what) async {
      final sizes = finder.evaluate().map((e) => tester.getSize(find.byWidget(e.widget)));
      expect(sizes, isNotEmpty, reason: 'found no $what');
      for (final s in sizes) {
        expect(math.min(s.width, s.height), greaterThanOrEqualTo(48.0),
            reason: '$what is ${s.width}×${s.height}');
      }
    }

    testWidgets('a button', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: const Scaffold(body: Center(child: Btn('Approve'))),
      ));
      await targets(tester, find.byType(Btn), 'the button');
    });

    testWidgets('an app bar control, and a filter chip in its row', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          body: Column(children: [
            Bar(title: 'Indents', onBack: () {}, actions: [
              BarButton(icon: Icons.search_rounded, label: 'Search', onTap: () {}),
            ]),
            Chips([FilterChip2(label: 'Pending', count: 2, onTap: () {})]),
          ]),
        ),
      ));
      await targets(tester, find.byType(BarButton), 'an app bar control');
      // The chip itself is 36 high; the row gives it the target.
      expect(tester.getSize(find.byType(Chips)).height, greaterThanOrEqualTo(48));
    });

    testWidgets('a bottom bar tab', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          body: Column(children: [
            const Spacer(),
            BottomBar(current: 'dashboard', onHome: () {}, onApprovals: () {}, onMore: () {}),
          ]),
        ),
      ));
      for (final label in ['Home', 'Approvals', 'Tasks', 'More']) {
        final box = tester.getSize(find.ancestor(
          of: find.text(label),
          matching: find.byType(InkWell),
        ).first);
        expect(box.height, greaterThanOrEqualTo(48.0), reason: label);
      }
    });
  });

  group('the shell is the one the canvas draws', () {
    testWidgets('four tabs — Home, Approvals, the module, More', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          body: Column(children: [
            const Spacer(),
            BottomBar(
              current: 'third',
              thirdLabel: 'Indents',
              thirdIcon: Icons.description_outlined,
              onHome: () {},
              onApprovals: () {},
              onMore: () {},
              approvalsBadge: 6,
            ),
          ]),
        ),
      ));
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Approvals'), findsOneWidget);
      // The third tab is "where you are", not a fixed destination.
      expect(find.text('Indents'), findsOneWidget);
      expect(find.text('More'), findsOneWidget);
      expect(find.text('6'), findsOneWidget);
    });

    testWidgets('the drawer is navy, with the account and the workspace on it',
        (tester) async {
      useEmptyPrefs();
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          drawer: NavDrawer(
            session: sessionWith(const ['approvals.queue.view', 'material.indent.view']),
            current: 'approvals',
            onPick: (_) {},
            onProject: () {},
            onSignOut: () {},
            badges: const {'approvals': 6},
          ),
          body: const SizedBox(),
        ),
      ));
      tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
      await tester.pumpAndSettle();

      expect(find.text('Anil Deshpande'), findsOneWidget);
      expect(find.textContaining('Project Manager'), findsOneWidget);
      expect(find.text('WORKSPACE'), findsOneWidget);
      expect(find.text('All projects'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);

      final drawer = tester.widget<Drawer>(find.byType(Drawer));
      expect(drawer.backgroundColor, T.navy950);
    });

    /*
     * A module listed but unfinished is what made the first attempt feel
     * broken — a drawer full of entries that led nowhere. Only built modules
     * are drawn, and the rest are summed up honestly at the foot.
     */
    testWidgets('lists only finished modules, and says how many are not',
        (tester) async {
      useEmptyPrefs();
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          drawer: NavDrawer(
            session: sessionWith(const [], superAdmin: true),
            current: 'dashboard',
            onPick: (_) {},
            onProject: () {},
            onSignOut: () {},
          ),
          body: const SizedBox(),
        ),
      ));
      tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
      await tester.pumpAndSettle();

      for (final m in navigation.expand((g) => g.mods)) {
        if (m.built) {
          expect(find.text(m.label), findsWidgets, reason: '${m.label} is built');
        } else {
          expect(find.text(m.label), findsNothing, reason: '${m.label} is not built');
        }
      }
      expect(find.textContaining('still being built'), findsOneWidget);
    });
  });

  group('status is never carried by hue alone', () {
    /// Each tint differs in lightness too, so status survives a greyscale
    /// print and the ~8% of men with a colour vision deficiency.
    test('the tints differ in lightness, not only in hue', () {
      final tints = {
        'good': T.goodTint, 'warn': T.warnTint, 'bad': T.badTint,
        'plum': T.plumTint, 'info': T.brand100, 'draft': T.draftTint,
      };
      final seen = <String, double>{};
      tints.forEach((name, c) => seen[name] = contrast(c, Colors.black));
      final values = seen.values.toList()..sort();
      for (var i = 1; i < values.length; i++) {
        expect((values[i] - values[i - 1]).abs(), greaterThan(0.05),
            reason: 'two tints are the same lightness: $seen');
      }
    });
  });

  group('money reads the way it is spoken here', () {
    test('lakh and crore', () {
      expect(money(1860000), '₹18.60 L');
      expect(money(42000000), '₹4.20 Cr');
      expect(money(595000), '₹5.95 L');
    });

    test('groups a small amount the Indian way', () {
      expect(money(1234567), '₹12.35 L');
      expect(money(12345), '₹12,345');
      expect(money(500), '₹500');
    });

    test('keeps a negative negative, and says nothing for nothing', () {
      expect(money(-1860000), '-₹18.60 L');
      expect(money(null), '—');
    });
  });
}
