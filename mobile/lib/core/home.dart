import 'package:flutter/material.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import '../modules/dashboard.dart';
import '../modules/earnings.dart';
import '../modules/incentives.dart';
import '../modules/module_screen.dart';
import '../modules/notifications.dart';
import '../modules/profile.dart';
import '../modules/punch.dart';
import '../modules/referrals.dart';
import '../modules/support.dart';
import 'api.dart';
import 'nav.dart';
import 'session.dart';
import 'shell.dart';

/// The shell: one module at a time, with the drawer and the bottom bar around
/// it. Each module draws its own bar, because the bar carries that
/// module's title, counts and controls.
///
/// A rider's bar is Home · Payouts · Profile and their drawer is the app's
/// own menu — earnings, attendance, incentives, referrals, notifications,
/// support. Staff keep the web's navigation in the drawer behind More.
class Home extends StatefulWidget {
  const Home({
    super.key,
    required this.api,
    required this.auth,
    required this.session,
    required this.onSignOut,
  });

  final Api api;
  final Auth auth;
  final Session session;
  final VoidCallback onSignOut;

  @override
  State<Home> createState() => HomeState();
}

/// The rider's menu: screens of the app's own, keyed by a route of our own
/// making so the drawer can draw them like any other entry.
List<NavSection> riderNavigation(Session s) {
  final r = s.rider;
  if (r == null) return const [];
  return [
    NavSection('Rider', [
      if (s.can('payout.payout.view')) const NavItem(href: '/earnings', label: 'My Earnings'),
      if (s.can('hr.attendance.view')) const NavItem(href: '/attendance', label: 'Attendance'),
      if (r.incentives != null) const NavItem(href: '/incentives', label: 'Incentives'),
      const NavItem(href: '/referrals', label: 'Referrals'),
      const NavItem(href: '/notifications', label: 'Notifications'),
      const NavItem(href: '/support', label: 'Support / Help'),
    ]),
  ];
}

class HomeState extends State<Home> {
  final _drawer = GlobalKey<ScaffoldState>();
  late Session _session;

  /// The web route of whatever is open — the same identity the server's
  /// navigation uses.
  String _current = '/dashboard';

  /// Set when a screen the web reaches from inside another is opened, since
  /// those are not menu entries and so have no route of their own here.
  String? _related;

  /// The filters the open list starts on, where a home tile chose them.
  Map<String, String> _query = const {};

  List<NavSection> _nav = const [];
  final Map<String, int> _badges = {};

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    _loadNav();
    _countUnread();
  }

  bool get _isRider => _session.rider != null;

  /// The bell's count, read once when home opens — the web's shell counts it
  /// on every page, so it cannot wait until somebody visits the screen.
  Future<void> _countUnread() async {
    final res = await widget.api.get('/notifications');
    if (!mounted || !res.ok) return;
    final n = (res.data!['unread'] as num?)?.toInt() ?? 0;
    if (_badges['/notifications'] != n) {
      setState(() => _badges['/notifications'] = n);
    }
  }

  Future<void> _loadNav() async {
    if (_isRider) return;
    final nav = await loadNavigation(widget.api);
    if (!mounted) return;
    setState(() => _nav = nav);
  }

  /// The list key of whatever is open.
  String? get _moduleKey => _related ?? hrefToModule[_current];

  /// Opens a web route, by the href the server's navigation uses.
  void _open(String href, [Map<String, String> query = const {}]) {
    setState(() {
      _current = href;
      _related = null;
      _query = query;
    });
  }

  void _push(Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  Future<void> _refreshSession() async {
    final s = await widget.auth.reload();
    if (mounted && s.ok) setState(() => _session = s.data!);
  }

  /// A rider's own menu entries open screens of the app's; the rest are web
  /// routes the shell renders in place.
  void _pick(NavItem m) {
    Navigator.pop(context);
    final notice = webOnly[m.href];
    if (notice != null) {
      notify(context, notice);
      return;
    }
    switch (m.href) {
      case '/earnings':
        _push(EarningsScreen(api: widget.api, session: _session));
      case '/attendance':
        _push(PunchScreen(api: widget.api));
      case '/incentives':
        _push(IncentivesScreen(api: widget.api, session: _session));
      case '/referrals':
        _push(ReferralScreen(api: widget.api, session: _session));
      case '/support':
        _push(SupportScreen(session: _session));
      default:
        _open(m.href);
    }
  }

  NavItem? get _item => [..._nav, ...riderNavigation(_session)]
      .expand((g) => g.items)
      .where((i) => i.href == _current)
      .firstOrNull;

  /// The middle tab takes the name of wherever you are — it is "where you
  /// are", not a fixed destination. For a rider it is always Payouts.
  (String, IconData) get _third {
    if (_isRider) return _homeThird;
    if (_related != null) {
      // The label the web's own link carries, which is how you got here.
      final label = relatedScreens.values
          .expand((l) => l)
          .where((e) => e.$1 == _related)
          .map((e) => e.$2)
          .firstOrNull;
      return (label ?? 'Open', Icons.chevron_right_rounded);
    }
    final i = _item;
    if (i == null || i.href == '/dashboard' || i.href == '/notifications') {
      return _homeThird;
    }
    return (i.label, i.icon);
  }

  /// The middle tab from home: the list this person works most.
  (String, IconData) get _homeThird {
    final s = _session;
    if (s.rider != null) return ('Payouts', Icons.account_balance_wallet_outlined);
    if (s.can('sales.lead.view')) return ('Leads', Icons.person_search_outlined);
    if (s.can('hr.employee.view')) return ('My team', Icons.groups_outlined);
    return ('Tasks', Icons.check_box_outlined);
  }

  String get _homeThirdHref {
    final s = _session;
    if (s.rider != null) return '/payouts';
    if (s.can('sales.lead.view')) return '/sales/leads';
    if (s.can('hr.employee.view')) return '/hr';
    return '/tasks';
  }

  Widget get _bottom {
    final (label, icon) = _third;
    final onHome = _related == null && _current == '/dashboard';
    final onProfile = _related == null && _current == '/profile';
    final onThird = _isRider ? (_related == null && _current == '/payouts') : (!onHome && !onProfile);
    return BottomBar(
      current: onHome ? 'dashboard' : (onProfile ? 'more' : (onThird ? 'third' : '')),
      thirdLabel: label,
      thirdIcon: icon,
      onHome: () => _open('/dashboard'),
      onThird: _isRider
          ? () => _open('/payouts')
          : (onHome ? () => _open(_homeThirdHref) : null),
      moreLabel: _isRider ? 'Profile' : 'More',
      moreIcon: _isRider ? Icons.person_outline_rounded : Icons.menu_rounded,
      onMore: _isRider ? () => _open('/profile') : () => _drawer.currentState?.openDrawer(),
    );
  }

  Future<void> _signOut() async {
    await widget.auth.signOut();
    widget.onSignOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _drawer,
      backgroundColor: T.page,
      drawerEdgeDragWidth: 24,
      drawer: NavDrawer(
        session: _session,
        current: _current,
        sections: _isRider ? riderNavigation(_session) : _nav,
        badges: _badges,
        onPick: _pick,
        onSignOut: () async {
          Navigator.pop(context);
          await _signOut();
        },
      ),
      body: _module(),
    );
  }

  Widget _module() {
    switch (_related == null ? _current : '') {
      case '/notifications':
        return NotificationsScreen(
          api: widget.api,
          bottom: _bottom,
          onBack: () => _open('/dashboard'),
          onCount: (n) {
            if (_badges['/notifications'] != n) {
              setState(() => _badges['/notifications'] = n);
            }
          },
        );
      case '/profile':
        return ProfileHub(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onOpen: (moduleKey, query) => _openModule(moduleKey, query),
          onNotifications: () => _open('/notifications'),
          onSignOut: _signOut,
        );
      default:
        // Every list module is the same pattern, and the server describes it:
        // the title, the placeholder, the filters, the band and every row.
        final moduleKey = _moduleKey;
        if (moduleKey != null) {
          return ModuleScreen(
            api: widget.api,
            session: _session,
            moduleKey: moduleKey,
            initialQuery: _query,
            bottom: _bottom,
            onBack: () => _related != null ? _open(_current) : _open('/dashboard'),
            onOpenRelated: (key) => setState(() => _related = key),
          );
        }
        return DashboardScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onMenu: () => _drawer.currentState?.openDrawer(),
          onNotifications: () => _open('/notifications'),
          unread: _badges['/notifications'],
          onRefreshSession: _refreshSession,
          onOpen: _openModule,
        );
    }
  }

  void _openModule(String moduleKey, Map<String, String> query) {
    final href = hrefToModule.entries
        .where((e) => e.value == moduleKey)
        .map((e) => e.key)
        .firstOrNull;
    if (href != null) {
      _open(href, query);
    } else {
      setState(() {
        _related = moduleKey;
        _query = query;
      });
    }
  }
}
