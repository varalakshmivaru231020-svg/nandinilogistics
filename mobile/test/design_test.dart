import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/core/nav.dart';
import 'package:nninfra/core/shell.dart';
import 'package:nninfra/design/components.dart';
import 'package:nninfra/design/tokens.dart';

import 'support.dart';

/// The design, asserted.
///
/// The palette is the app's own — an ember-red accent on a warm off-white
/// page, charcoal for the dark surfaces — and every value below is the one
/// `tokens.dart` sets, so a stray approximation in a screen cannot drift the
/// look. The type floor and the 48dp target are held here too.

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
  group('the palette is the design palette', () {
    test('charcoal, the accent and the page', () {
      expect(T.dark950, const Color(0xFF17141A));
      expect(T.dark800, const Color(0xFF2A2530));
      expect(T.accent500, const Color(0xFFD92F38));
      expect(T.accent700, const Color(0xFFA52B35));
      expect(T.accent100, const Color(0xFFFCE9EB));
      expect(T.page, const Color(0xFFF8F5F5));
      expect(T.line, const Color(0xFFEBE6E6));
    });

    /// The primary button is white on the accent, so the accent has to be
    /// deep enough to carry it — a brighter coral reads better in a mock-up
    /// and fails AA on a phone in the sun.
    test('white is legible on the accent, and the accent ink on its tint', () {
      expect(contrast(Colors.white, T.accent500), greaterThanOrEqualTo(4.5));
      expect(contrast(T.accent700, T.accent100), greaterThanOrEqualTo(4.5));
      expect(contrast(T.accent700, T.card), greaterThanOrEqualTo(4.5));
    });

    /*
     * Each status is a solid, a tint and an ink — three values, not one. The
     * first attempt used the ink as the solid, which made every green button
     * the colour of green text.
     */
    test('each status has its solid, its tint and its ink', () {
      expect((T.good, T.goodTint, T.goodInk),
          (const Color(0xFF22A45A), const Color(0xFFE4F6EC), const Color(0xFF177049)));
      expect((T.warn, T.warnTint, T.warnInk),
          (const Color(0xFFE8A13A), const Color(0xFFFDF3E7), const Color(0xFF8A5A12)));
      expect((T.bad, T.badTint, T.badInk),
          (const Color(0xFFD8494A), const Color(0xFFFCEDED), const Color(0xFFB23334)));
      expect((T.plum, T.plumTint, T.plumInk),
          (const Color(0xFF6A46C8), const Color(0xFFEFE9FC), const Color(0xFF5636A8)));
    });

    /// The design names this and the first attempt did not have it at all,
    /// using the lighter `muted` for second lines instead.
    test('secondary ink exists and is the design value', () {
      expect(T.secondary, const Color(0xFF5E5760));
    });

    test('status ink on its own tint is legible', () {
      for (final (name, ink, tint) in [
        ('good', T.goodInk, T.goodTint),
        ('warn', T.warnInk, T.warnTint),
        ('bad', T.badInk, T.badTint),
        ('plum', T.plumInk, T.plumTint),
        ('info', T.infoInk, T.infoTint),
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

    test('white is legible on the dark surfaces', () {
      expect(contrast(Colors.white, T.dark950), greaterThanOrEqualTo(4.5));
      expect(contrast(T.onDarkSecondary, T.dark950), greaterThanOrEqualTo(4.5));
      expect(contrast(T.accent300, T.dark950), greaterThanOrEqualTo(4.5));
    });

    /// The bar is light now — its title is ink on the page.
    test('the bar title is legible on the page', () {
      expect(contrast(T.barTitle().color!, T.page), greaterThanOrEqualTo(4.5));
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

    test('the screen title and the section are Sora at the design sizes', () {
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
    test('are the design scale', () {
      expect(T.rButton, 14);
      expect(T.rControl, 12);
      expect(T.rCard, 18);
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
            Bar(title: 'Advances', onBack: () {}, actions: [
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
            BottomBar(current: 'dashboard', onHome: () {}, onMore: () {}),
          ]),
        ),
      ));
      for (final label in ['Home', 'Tasks', 'More']) {
        final box = tester.getSize(find.ancestor(
          of: find.text(label),
          matching: find.byType(InkWell),
        ).first);
        expect(box.height, greaterThanOrEqualTo(48.0), reason: label);
      }
    });
  });

  group('the shell is the one the design draws', () {
    testWidgets('three tabs — Home, the module, More', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          body: Column(children: [
            const Spacer(),
            BottomBar(
              current: 'third',
              thirdLabel: 'Leads',
              thirdIcon: Icons.person_search_outlined,
              onHome: () {},
              onMore: () {},
            ),
          ]),
        ),
      ));
      expect(find.text('Home'), findsOneWidget);
      // The third tab is "where you are", not a fixed destination.
      expect(find.text('Leads'), findsOneWidget);
      expect(find.text('More'), findsOneWidget);
    });

    testWidgets('the drawer is charcoal, with the account on it',
        (tester) async {
      useEmptyPrefs();
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          drawer: NavDrawer(
            session: sessionWith(const ['task.task.view', 'sales.lead.view']),
            current: '/tasks',
            sections: const [
              NavSection('Overview', [
                NavItem(href: '/dashboard', label: 'Dashboard'),
                NavItem(href: '/tasks', label: 'Tasks'),
              ]),
            ],
            onPick: (_) {},
            onSignOut: () {},
            badges: const {'/tasks': 6},
          ),
          body: const SizedBox(),
        ),
      ));
      tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
      await tester.pumpAndSettle();

      expect(find.text('Manjunath Gowda'), findsOneWidget);
      expect(find.textContaining('Team Leader'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
      // The count the server sent, on the entry it belongs to.
      expect(find.text('6'), findsOneWidget);

      final drawer = tester.widget<Drawer>(find.byType(Drawer));
      expect(drawer.backgroundColor, T.dark950);
    });

    /*
     * The menu is the server's — the web's own NAVIGATION, in its own order
     * with its own labels. The app keeps no list of its own, which is what
     * stopped the two from matching: a dozen screens the web reaches from
     * inside other screens had been promoted to the menu here.
     */
    test('every menu entry the web can send maps to a screen or is web-only', () {
      // `hrefToModule` is the only thing the app says about a route: which
      // list it reads. A route with no entry must be one with a screen of its
      // own, or Masters, which is web-only by design.
      const ownScreen = {'/dashboard'};
      const webOnly = {'/masters', '/reports'};
      for (final href in hrefToModule.keys) {
        expect(ownScreen.contains(href), isFalse, reason: href);
      }
      for (final href in webOnly) {
        expect(hrefToModule.containsKey(href), isFalse, reason: href);
      }
    });

    /// The screens the web reaches contextually are offered from their parent,
    /// not from the menu — so every one of them names a real parent.
    test('related screens hang off a route the menu has', () {
      for (final parent in relatedScreens.keys) {
        expect(hrefToModule.values, contains(parent), reason: parent);
      }
    });

    testWidgets('draws the groups and the first rows of the menu', (tester) async {
      useEmptyPrefs();
      await tester.pumpWidget(MaterialApp(
        theme: T.theme,
        home: Scaffold(
          drawer: NavDrawer(
            session: sessionWith(const [], superAdmin: true),
            current: '/dashboard',
            sections: const [
              NavSection('Overview', [
                NavItem(href: '/dashboard', label: 'Dashboard'),
                NavItem(href: '/tasks', label: 'Tasks'),
              ]),
            ],
            onPick: (_) {},
            onSignOut: () {},
          ),
          body: const SizedBox(),
        ),
      ));
      tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
      await tester.pumpAndSettle();

      expect(find.text('OVERVIEW'), findsOneWidget);
      expect(find.text('Dashboard'), findsOneWidget);
      expect(find.text('Tasks'), findsOneWidget);
    });
  });

  group('status is never carried by hue alone', () {
    /// Each tint differs in lightness too, so status survives a greyscale
    /// print and the ~8% of men with a colour vision deficiency.
    test('the tints differ in lightness, not only in hue', () {
      final tints = {
        'good': T.goodTint, 'warn': T.warnTint, 'bad': T.badTint,
        'plum': T.plumTint, 'info': T.infoTint, 'draft': T.draftTint,
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
