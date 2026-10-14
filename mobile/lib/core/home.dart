import 'package:flutter/material.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import '../modules/approvals.dart';
import '../modules/calendar.dart';
import '../modules/dashboard.dart';
import '../modules/module_screen.dart';
import '../modules/spec.dart';
import 'api.dart';
import 'modules.dart';
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
  String _current = 'dashboard';
  final Map<String, int> _badges = {};

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    widget.api.projectId = _session.projectId;
  }

  void _open(String key) {
    final known = navigation.expand((g) => g.mods).where((m) => m.key == key && m.built);
    if (known.isEmpty) {
      notify(context, 'That module is not on the phone yet.');
      return;
    }
    setState(() => _current = key);
  }

  Mod? get _mod =>
      navigation.expand((g) => g.mods).where((m) => m.key == _current).firstOrNull;

  /// The third tab takes the name of wherever you are, as the design shows on
  /// the indent list — it is "where you are", not a fixed destination.
  (String, IconData) get _third {
    final m = _mod;
    if (m == null || m.key == 'dashboard' || m.key == 'approvals') {
      return ('Tasks', Icons.check_box_outlined);
    }
    return (m.label, m.icon);
  }

  Widget get _bottom {
    final (label, icon) = _third;
    return BottomBar(
      current: _current == 'dashboard'
          ? 'dashboard'
          : _current == 'approvals'
              ? 'approvals'
              : 'third',
      thirdLabel: label,
      thirdIcon: icon,
      approvalsBadge: _badges['approvals'],
      onHome: () => setState(() => _current = 'dashboard'),
      onApprovals: () => _session.can('approvals.queue.view')
          ? setState(() => _current = 'approvals')
          : notify(context, 'You do not have the approvals queue.'),
      onThird: _current == 'dashboard' || _current == 'approvals'
          ? () => notify(context, 'Tasks is the next module being built.')
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
        badges: _badges,
        onPick: (m) {
          Navigator.pop(context);
          setState(() => _current = m.key);
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
    switch (_current) {
      case 'approvals':
        return ApprovalsScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onBack: () => setState(() => _current = 'dashboard'),
          onCount: (n) {
            if (_badges['approvals'] != n) setState(() => _badges['approvals'] = n);
          },
        );
      case 'calendar':
        return CalendarScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onBack: () => setState(() => _current = 'dashboard'),
        );
      default:
        // Every list module is the same pattern with its own spec — the band,
        // the filters, the row and the actions all come from `spec.dart`.
        final spec = moduleSpecs[_current];
        if (spec != null) {
          return ModuleScreen(
            api: widget.api,
            session: _session,
            spec: spec,
            bottom: _bottom,
            onBack: () => setState(() => _current = 'dashboard'),
            onPickProject: _pickProjectFromModule,
          );
        }
        return DashboardScreen(
          api: widget.api,
          session: _session,
          bottom: _bottom,
          onMenu: () => _drawer.currentState?.openDrawer(),
          onOpen: _open,
          onApprovalCount: (n) {
            if (_badges['approvals'] != n) setState(() => _badges['approvals'] = n);
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
      _current = 'dashboard';
      if (was != 'dashboard') _current = was;
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
