import 'package:flutter/material.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import '../modules/approvals.dart';
import '../modules/calendar.dart';
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

  List<NavSection> _nav = const [];
  final Map<String, int> _badges = {};

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    widget.api.projectId = _session.projectId;
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
  void _open(String href) {
    setState(() {
      _current = href;
      _related = null;
    });
  }

  NavItem? get _item => _nav
      .expand((g) => g.items)
      .where((i) => i.href == _current)
      .firstOrNull;

  /// The third tab takes the name of wherever you are, as the design shows on
  /// the indent list — it is "where you are", not a fixed destination.
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
    if (i == null || i.href == '/dashboard' || i.href == '/approvals') {
      return ('Tasks', Icons.check_box_outlined);
    }
    return (i.label, i.icon);
  }

  Widget get _bottom {
    final (label, icon) = _third;
    return BottomBar(
      current: _related == null && _current == '/dashboard'
          ? 'dashboard'
          : _related == null && _current == '/approvals'
              ? 'approvals'
              : 'third',
      thirdLabel: label,
      thirdIcon: icon,
      approvalsBadge: _badges['/approvals'],
      onHome: () => _open('/dashboard'),
      onApprovals: () => _session.can('approvals.queue.view')
          ? _open('/approvals')
          : notify(context, 'You do not have the approvals queue.'),
      onThird: _related == null && (_current == '/dashboard' || _current == '/approvals')
          ? () => _open('/tasks')
          : null,
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
          if (m.href == '/masters') {
            notify(context, 'Masters & Users is managed on the web.');
            return;
          }
          _open(m.href);
        },
        onProject: _pickProject,
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
      case '/approvals':
        return ApprovalsScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onBack: () => _open('/dashboard'),
          onCount: (n) {
            if (_badges['/approvals'] != n) setState(() => _badges['/approvals'] = n);
          },
        );
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
      case '/calendar':
        return CalendarScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onBack: () => _open('/dashboard'),
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
            bottom: _bottom,
            onBack: () => _related != null ? _open(_current) : _open('/dashboard'),
            onPickProject: _pickProjectFromModule,
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
          onOpen: (moduleKey) {
            final href = hrefToModule.entries
                .where((e) => e.value == moduleKey)
                .map((e) => e.key)
                .firstOrNull;
            if (href != null) {
              _open(href);
            } else {
              setState(() => _related = moduleKey);
            }
          },
          onApprovalCount: (n) {
            if (_badges['/approvals'] != n) setState(() => _badges['/approvals'] = n);
          },
        );
    }
  }

  /// The chooser, reached from a module that cannot answer without a project
  /// rather than from the drawer.
  Future<void> _pickProjectFromModule() => _choose();

  Future<void> _pickProject() async {
    Navigator.pop(context);
    await _choose();
  }

  Future<void> _choose() async {
    final chosen = await sheet<String>(
      context,
      title: 'Project',
      explain: 'A view filter, not access. Only the projects mapped to you are offered, '
          'and choosing one narrows what every screen shows.',
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _projectTile(ctx, null, 'All projects', Icons.all_inclusive_rounded),
        for (final p in _session.projects)
          _projectTile(ctx, p.id, p.label, Icons.home_work_outlined),
      ]),
    );
    if (chosen == null || !mounted) return;
    final id = chosen.isEmpty ? null : chosen;
    setState(() {
      _session = _session.withProject(id);
      widget.api.projectId = id;
      // Re-enter the module so it re-reads under the new scope.
      final was = _current;
      _current = '/dashboard';
      if (was != '/dashboard') _current = was;
    });
  }

  Widget _projectTile(BuildContext ctx, String? id, String label, IconData icon) {
    final selected = id == _session.projectId;
    return Material(
      color: selected ? T.brand100 : Colors.transparent,
      borderRadius: BorderRadius.circular(T.rControl),
      child: InkWell(
        onTap: () => Navigator.pop(ctx, id ?? ''),
        borderRadius: BorderRadius.circular(T.rControl),
        child: Container(
          constraints: const BoxConstraints(minHeight: T.target),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            Icon(icon, size: 20, color: selected ? T.brand700 : T.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label,
                  style: T.body(
                      color: selected ? T.brand700 : T.ink,
                      weight: selected ? FontWeight.w700 : FontWeight.w600)),
            ),
            if (selected) const Icon(Icons.check_rounded, size: 20, color: T.brand700),
          ]),
        ),
      ),
    );
  }
}
