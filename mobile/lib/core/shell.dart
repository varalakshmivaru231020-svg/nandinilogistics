import 'package:flutter/material.dart';

import '../design/tokens.dart';
import 'nav.dart';
import 'session.dart';

/// The three tabs: Home, the module you are in (Tasks by default), More.
///
/// The third tab takes the name of whatever module is open, which is how the
/// design shows it on every list — the tab is "where you are", not a
/// fixed destination.
class BottomBar extends StatelessWidget {
  const BottomBar({
    super.key,
    required this.current,
    required this.onHome,
    required this.onMore,
    this.thirdLabel = 'Tasks',
    this.thirdIcon = Icons.check_box_outlined,
    this.onThird,
  });

  final String current;
  final VoidCallback onHome;
  final VoidCallback onMore;
  final String thirdLabel;
  final IconData thirdIcon;
  final VoidCallback? onThird;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: T.card,
        border: Border(top: BorderSide(color: T.line)),
      ),
      // A little air at the ends, so the first and last tabs are not hard
      // against the edge of the glass.
      padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.of(context).padding.bottom + 10),
      child: Row(children: [
        _tab('Home', Icons.grid_view_rounded, current == 'dashboard', onHome),
        _tab(thirdLabel, thirdIcon, current == 'third', onThird),
        _tab('More', Icons.menu_rounded, false, onMore),
      ]),
    );
  }

  Widget _tab(String label, IconData icon, bool active, VoidCallback? onTap, {int? badge}) {
    /*
     * The badge rides on the icon, not on the cell.
     *
     * It used to be positioned 18 from the right of the whole tab, which is a
     * different distance from the icon in every tab — the wider the cell, the
     * further adrift it sat, and on a four-tab bar it read as belonging to
     * nothing. Stacked on the icon it is in the same place every time.
     */
    final mark = Stack(clipBehavior: Clip.none, children: [
      Icon(icon, size: 21, color: active ? T.brand500 : T.faint),
      if (badge != null && badge > 0)
        Positioned(
          top: -6,
          left: 12,
          child: Container(
            constraints: const BoxConstraints(minWidth: 17),
            height: 17,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: T.warn,
              borderRadius: BorderRadius.circular(T.rPill),
              border: Border.all(color: T.card, width: 1.5),
            ),
            child: Text('$badge', style: T.num(10, color: T.navy950, weight: FontWeight.w800)),
          ),
        ),
    ]);

    return Expanded(
      child: Semantics(
        button: true,
        selected: active,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: T.target,
            // Centred as a pair, so every tab's icon sits on the same line and
            // every label under it — whatever the label's length.
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                mark,
                const SizedBox(height: 3),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Text(label,
                      maxLines: 1,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w600,
                        color: active ? T.brand700 : T.muted,
                      )),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The drawer: navy, full height, with the account at the top and the menu built from what the viewer may actually open.
class NavDrawer extends StatelessWidget {
  const NavDrawer({
    super.key,
    required this.session,
    required this.current,
    required this.sections,
    required this.onPick,
    required this.onSignOut,
    this.badges = const {},
  });

  final Session session;

  /// The web route of whatever is open.
  final String current;

  /// The web's own navigation, as the server sent it.
  final List<NavSection> sections;

  final void Function(NavItem) onPick;
  final VoidCallback onSignOut;
  final Map<String, int> badges;

  @override
  Widget build(BuildContext context) {
    final groups = sections;

    return Drawer(
      backgroundColor: T.navy950,
      width: 320,
      child: Column(children: [
        // account
        Container(
          padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 18, 16, 18),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.12))),
          ),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [T.brand500, T.navy800],
                ),
              ),
              child: Text(session.initials,
                  style: T.metric(15, color: Colors.white).copyWith(height: 1)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(session.name,
                    style: T.body(color: Colors.white, weight: FontWeight.w700)
                        .copyWith(fontSize: 15),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(session.standing,
                    style: T.caption(color: T.onNavySecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ]),
            ),
          ]),
        ),

        // menu
        Expanded(
          child: ListView(padding: const EdgeInsets.fromLTRB(10, 6, 10, 0), children: [
            for (final g in groups) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 13, 10, 5),
                child: Text(g.label.toUpperCase(),
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                        color: T.muted)),
              ),
              for (final m in g.items) _item(m),
            ],
            if (groups.isEmpty)
              Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'Nothing here is available to you yet. Your administrator '
                  'decides what you can open.',
                  style: T.secondaryText(color: T.onNavyBody),
                ),
              ),
          ]),
        ),

        // sign out
        Container(
          decoration: BoxDecoration(
            color: T.navyBar,
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.12))),
          ),
          child: SafeArea(
            top: false,
            child: InkWell(
              onTap: onSignOut,
              child: Container(
                height: 56,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(children: [
                  const Icon(Icons.logout_rounded, size: 20, color: T.brand300),
                  const SizedBox(width: 12),
                  Text('Sign out',
                      style: T.body(color: Colors.white, weight: FontWeight.w700)),
                  const SizedBox(width: 12),
                  // Flexible, not a Spacer: an email is as long as it is, and a
                  // long one pushed this row off the edge of the drawer.
                  Flexible(
                    child: Text(session.email,
                        textAlign: TextAlign.right,
                        style: T.caption(color: T.onNavySecondary).copyWith(fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _item(NavItem m) {
    final active = m.href == current;
    final count = badges[m.href];
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            gradient: active
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [T.brand500, T.navy800])
                : null,
          ),
          child: InkWell(
            onTap: () => onPick(m),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              constraints: const BoxConstraints(minHeight: T.target),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(children: [
                Icon(m.icon, size: 19, color: active ? Colors.white : T.onNavySecondary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(m.label,
                      style: T.body(
                        color: active ? Colors.white : T.onNavyBody,
                        weight: active ? FontWeight.w700 : FontWeight.w600,
                      ).copyWith(fontSize: 14.5)),
                ),
                if (count != null && count > 0)
                  Container(
                    constraints: const BoxConstraints(minWidth: 22),
                    height: 22,
                    padding: const EdgeInsets.symmetric(horizontal: 7),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: active ? Colors.white.withValues(alpha: 0.22) : T.warn,
                      borderRadius: BorderRadius.circular(T.rPill),
                    ),
                    child: Text('$count',
                        style: T.num(11.5,
                            color: active ? Colors.white : T.navy950,
                            weight: FontWeight.w800)),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
