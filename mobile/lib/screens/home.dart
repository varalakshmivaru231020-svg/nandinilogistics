import 'package:flutter/material.dart';

import '../api.dart';
import '../modules.dart';
import '../session.dart';
import '../theme.dart';
import 'calendar_screen.dart';
import 'list_screen.dart';
import 'reports_screen.dart';

/// The shell: a drawer of the modules this person may open, and the screen
/// they chose. Nothing in the drawer refuses when tapped, because a module
/// whose permission they lack is not drawn.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
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
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  Module? _module;
  late Session _session;

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    widget.api.projectId = _session.projectId;
  }

  List<Section> get _sections => visibleNavigation(_session.can, held: _session.permissions);

  @override
  Widget build(BuildContext context) {
    final body = _module == null
        ? _Overview(session: _session, onOpen: (m) => setState(() => _module = m))
        : _module!.isList
            ? ListScreen(api: widget.api, session: _session, module: _module!)
            : _module!.route == '/calendar'
                ? CalendarScreen(api: widget.api, session: _session)
                : _module!.route == '/reports'
                    ? ReportsScreen(api: widget.api, session: _session)
                    : _Overview(session: _session, onOpen: (m) => setState(() => _module = m));

    return Scaffold(
      drawer: _Drawer(
        session: _session,
        sections: _sections,
        active: _module,
        onPick: (m) {
          Navigator.pop(context);
          setState(() => _module = m);
        },
        onHome: () {
          Navigator.pop(context);
          setState(() => _module = null);
        },
        onProject: _pickProject,
        onSignOut: () async {
          Navigator.pop(context);
          await widget.auth.signOut();
          widget.onSignOut();
        },
      ),
      // Each screen draws its own app bar; the drawer button has to reach this
      // Scaffold, so the body is wrapped rather than given a bar of its own.
      body: Builder(
        builder: (inner) => Stack(children: [
          body,
          Positioned(
            top: MediaQuery.of(context).padding.top + 6,
            left: 8,
            child: IconButton(
              key: const Key('menu'),
              tooltip: 'Open menu',
              icon: const Icon(Icons.menu_rounded, color: Colors.white),
              onPressed: () => Scaffold.of(inner).openDrawer(),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _pickProject() async {
    Navigator.pop(context);
    final chosen = await showModalBottomSheet<String?>(
      context: context,
      backgroundColor: T.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheet) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 14),
          Text('Project', style: T.heading(17)),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'A view filter, not access. Only projects mapped to you are offered.',
              textAlign: TextAlign.center,
              style: T.body(12, color: T.muted),
            ),
          ),
          const SizedBox(height: 10),
          ListTile(
            leading: const Icon(Icons.all_inclusive_rounded, color: T.muted),
            title: Text('All projects', style: T.body(14.5, weight: FontWeight.w600)),
            onTap: () => Navigator.pop(sheet, ''),
          ),
          for (final p in _session.projects)
            ListTile(
              leading: const Icon(Icons.home_work_rounded, color: T.brandInk),
              title: Text(p.label, style: T.body(14.5, weight: FontWeight.w600)),
              selected: p.id == _session.projectId,
              onTap: () => Navigator.pop(sheet, p.id),
            ),
          const SizedBox(height: 12),
        ]),
      ),
    );
    if (chosen == null || !mounted) return;
    final id = chosen.isEmpty ? null : chosen;
    setState(() {
      _session = _session.withProject(id);
      widget.api.projectId = id;
      // Force the open list to re-read with the new scope.
      final current = _module;
      _module = null;
      _module = current;
    });
  }
}

/// What is on this person, and the way in to each module.
class _Overview extends StatelessWidget {
  const _Overview({required this.session, required this.onOpen});

  final Session session;
  final void Function(Module) onOpen;

  @override
  Widget build(BuildContext context) {
    final sections = visibleNavigation(session.can, held: session.permissions);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        color: T.navy,
        padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 14, 16, 16),
        child: Row(children: [
          const SizedBox(width: 44),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                session.projectId == null
                    ? 'ALL PROJECTS'
                    : session.projects
                        .firstWhere((p) => p.id == session.projectId,
                            orElse: () => const Project(id: '', code: '—', name: ''))
                        .code
                        .toUpperCase(),
                style: T.eyebrow.copyWith(color: const Color(0xFF9BA1C2), fontSize: 9.5),
              ),
              Text(session.name, style: T.heading(18, color: Colors.white)),
            ]),
          ),
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(session.initials,
                style: T.body(13, color: Colors.white, weight: FontWeight.w800)),
          ),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
          for (final section in sections) ...[
            Text(section.label.toUpperCase(), style: T.eyebrow),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 9,
              crossAxisSpacing: 9,
              /*
               * The tile grows with the system font instead of clipping. At
               * 200% text a fixed 2.1 ratio overflows every tile on this
               * screen — found by the usability test, not by looking at it.
               */
              childAspectRatio: 2.1 /
                  MediaQuery.textScalerOf(context).scale(1.0).clamp(1.0, 2.2),
              children: section.modules
                  .map((m) => InkWell(
                        key: Key('open-${m.label}'),
                        onTap: () => onOpen(m),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: T.surface,
                            border: Border.all(color: T.border),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Icon(m.icon, size: 21, color: T.brandInk),
                              Text(m.label,
                                  style: T.body(13, weight: FontWeight.w700),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 16),
          ],
          if (sections.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Text(
                'Nothing here is available to you yet.\nYour administrator assigns what you can open.',
                textAlign: TextAlign.center,
                style: T.body(14, color: T.muted),
              ),
            ),
        ]),
      ),
    ]);
  }
}

class _Drawer extends StatelessWidget {
  const _Drawer({
    required this.session,
    required this.sections,
    required this.active,
    required this.onPick,
    required this.onHome,
    required this.onProject,
    required this.onSignOut,
  });

  final Session session;
  final List<Section> sections;
  final Module? active;
  final void Function(Module) onPick;
  final VoidCallback onHome;
  final VoidCallback onProject;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: T.surface,
      child: SafeArea(
        child: Column(children: [
          Container(
            width: double.infinity,
            color: T.navy,
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('NN INFRA', style: T.eyebrow.copyWith(color: const Color(0xFF9BA1C2))),
              const SizedBox(height: 4),
              Text(session.name, style: T.heading(17, color: Colors.white)),
              Text(session.email, style: T.body(12, color: const Color(0xFF9BA1C2))),
            ]),
          ),
          Expanded(
            child: ListView(padding: EdgeInsets.zero, children: [
              ListTile(
                leading: const Icon(Icons.home_rounded, color: T.brandInk),
                title: Text('Overview', style: T.body(14.5, weight: FontWeight.w700)),
                onTap: onHome,
              ),
              const Divider(height: 1),
              for (final section in sections) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                  child: Text(section.label.toUpperCase(), style: T.eyebrow),
                ),
                for (final m in section.modules)
                  ListTile(
                    key: Key('nav-${m.label}'),
                    dense: true,
                    selected: active?.label == m.label,
                    selectedTileColor: T.surfaceAlt,
                    leading: Icon(m.icon, size: 20, color: T.muted),
                    title: Text(m.label, style: T.body(14, weight: FontWeight.w600)),
                    onTap: () => onPick(m),
                  ),
              ],
            ]),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.swap_horiz_rounded, color: T.muted),
            title: Text('Change project', style: T.body(14, weight: FontWeight.w600)),
            onTap: onProject,
          ),
          ListTile(
            key: const Key('sign-out'),
            leading: const Icon(Icons.logout_rounded, color: T.bad),
            title: Text('Sign out', style: T.body(14, color: T.bad, weight: FontWeight.w700)),
            onTap: onSignOut,
          ),
        ]),
      ),
    );
  }
}
