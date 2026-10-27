import 'package:flutter/material.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import '../modules/dashboard.dart';
import '../modules/module_screen.dart';
import '../modules/notifications.dart';
import 'api.dart';
import 'nav.dart';
import 'session.dart';
import 'shell.dart';

/// The shell: one module at a time, with the drawer and the bottom bar around
/// it. Each module draws its own navy bar, because the bar carries that
/// module's title, counts and controls.
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

  NavItem? get _item => _nav
      .expand((g) => g.items)
      .where((i) => i.href == _current)
      .firstOrNull;

  /// The third tab takes the name of wherever you are — it is "where you
  /// are", not a fixed destination.
  (String, IconData) get _third {
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
    if (i == null || i.href == '/dashboard') {
      return _homeThird;
    }
    return (i.label, i.icon);
  }

  /// The third tab from home: the list this person works most.
  (String, IconData) get _homeThird {
    final s = _session;
    if (s.rider != null) return ('Payouts', Icons.payments_outlined);
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
    return BottomBar(
      current: _related == null && _current == '/dashboard' ? 'dashboard' : 'third',
      thirdLabel: label,
      thirdIcon: icon,
      onHome: () => _open('/dashboard'),
      onThird: _related == null && _current == '/dashboard' ? () => _open(_homeThirdHref) : null,
      onMore: () => _drawer.currentState?.openDrawer(),
    );
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
        sections: _nav,
        badges: _badges,
        onPick: (m) {
          Navigator.pop(context);
          final notice = webOnly[m.href];
          if (notice != null) {
            notify(context, notice);
            return;
          }
          _open(m.href);
        },
        onSignOut: () async {
          Navigator.pop(context);
          await widget.auth.signOut();
          widget.onSignOut();
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
          onRefreshSession: () async {
            final s = await widget.auth.reload();
            if (mounted && s.ok) setState(() => _session = s.data!);
          },
          onOpen: (moduleKey, query) {
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
          },
        );
    }
  }
}
