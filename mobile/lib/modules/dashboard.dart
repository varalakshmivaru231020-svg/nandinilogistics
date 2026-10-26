import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/nav.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// What is on this person, and how each module they can see is doing.
///
/// Every number here is read from the boundary — the same queries the web
/// screens run. Nothing is invented, and a module the viewer cannot see is
/// absent rather than showing a zero.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onMenu,
    required this.onNotifications,
    this.unread,
    required this.onOpen,
    required this.bottom,
  });

  final Api api;
  final Session session;
  final VoidCallback onMenu;

  /// The bell, as the web carries one in its top bar.
  final VoidCallback onNotifications;

  /// How many are unread, for the dot on it.
  final int? unread;
  final void Function(String moduleKey) onOpen;

  final Widget bottom;

  @override
  State<DashboardScreen> createState() => DashboardScreenState();
}

class _Health {
  _Health(this.key, this.label, this.icon, this.tone);
  final String key;
  final String label;
  final IconData icon;
  final Tone tone;

  int total = 0;
  String detail = '';
  String? right;
  String? rightLabel;
  Tone? rightTone;
  bool failed = false;
}

class DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  int _tasksOverdue = 0;
  final _health = <_Health>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final can = widget.session.can;

    // Only what this person may see. Each is the module's own list — the same
    // query its screen runs — so the dashboard cannot disagree with the module.
    final wanted = <_Health>[
      if (can('task.task.view'))
        _Health('tasks', 'Tasks', Icons.check_box_outlined, Tone.info),
      if (can('sales.lead.view'))
        _Health('sales/leads', 'Leads', Icons.person_search_outlined, Tone.plum),
      if (can('sales.followUp.view'))
        _Health('sales/follow-ups', 'Follow-ups', Icons.phone_forwarded_outlined, Tone.warn),
      if (can('hr.employee.view'))
        _Health('hr/employees', 'Riders & Staff', Icons.badge_outlined, Tone.good),
    ];

    final jobs = <Future<void>>[
      for (final h in wanted)
        widget.api.get('/list/${h.key}').then((r) {
          if (!r.ok) {
            h.failed = true;
            return;
          }
          _fill(h, ListPage.from(r.data!));
        }),
    ];

    await Future.wait(jobs);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _health
        ..clear()
        ..addAll(wanted);
    });
  }

  /// Whether a task's status, as the row carries it, means it is done.
  static bool _done(String status) => status.toUpperCase().replaceAll(' ', '_') == 'DONE';

  /// Turns a list into the one line a health row shows.
  void _fill(_Health h, ListPage page) {
    final rows = page.rows;
    h.total = rows.length;

    String of(Map<String, dynamic> r, String key) => '${r[key] ?? ""}';

    switch (h.key) {
      case 'tasks':
        final open = rows.where((r) => !_done(of(r, 'status'))).length;
        final overdue = rows.where((r) {
          final due = DateTime.tryParse(of(r, 'dueAt'));
          if (due == null) return false;
          return !_done(of(r, 'status')) && due.millisecondsSinceEpoch < page.serverTime;
        }).length;
        _tasksOverdue = overdue;
        h.detail = '$open open · $overdue overdue';
        final onTime = h.total == 0 ? null : (((h.total - overdue) / h.total) * 100).round();
        h.right = onTime == null ? '—' : '$onTime%';
        h.rightLabel = 'on time';
        h.rightTone = onTime == null || onTime >= 90 ? Tone.good : (onTime >= 70 ? Tone.warn : Tone.bad);
      case 'sales/leads':
        h.detail = '${h.total} ${h.total == 1 ? "lead" : "leads"}';
        h.right = '${h.total}';
        h.rightLabel = 'in pipeline';
      case 'sales/follow-ups':
        final overdue = rows.where((r) {
          final raw = of(r, 'nextActionAt').isEmpty ? of(r, 'dueAt') : of(r, 'nextActionAt');
          final due = DateTime.tryParse(raw);
          return due != null && due.millisecondsSinceEpoch < page.serverTime;
        }).length;
        h.detail = '${h.total} open · $overdue overdue';
        h.right = '$overdue';
        h.rightLabel = 'overdue';
        h.rightTone = overdue > 0 ? Tone.bad : Tone.good;
      case 'hr/employees':
        final active = rows.where((r) => of(r, 'status').toUpperCase() == 'ACTIVE').length;
        h.detail = '$active active';
        h.right = '$active';
        h.rightLabel = 'active';
      default:
        h.detail = '${h.total} rows';
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Dashboard',
          subtitle: s.roleNames.isEmpty ? (s.isSuperAdmin ? 'Super admin' : 'No role') : s.roleNames.first,
          onMenu: widget.onMenu,
          actions: [
            // The web carries a bell in its top bar, on every screen, with the
            // unread count on it. Home is where it goes here.
            BarButton(
              icon: Icons.notifications_none_rounded,
              label: 'Notifications',
              dot: (widget.unread ?? 0) > 0,
              onTap: widget.onNotifications,
            ),
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load),
          ],
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 24),
                    children: [
                      if (s.can('task.task.view')) ...[
                        const Overline('Waiting on you'),
                        const SizedBox(height: 8),
                        Row(children: [
                          Expanded(
                            child: _Waiting(
                              value: '$_tasksOverdue',
                              label: 'Tasks overdue',
                              tone: _tasksOverdue > 0 ? Tone.bad : Tone.good,
                              // It counts tasks; it opens them.
                              onTap: () => widget.onOpen('tasks'),
                            ),
                          ),
                        ]),
                        const SizedBox(height: 18),
                      ],
                      if (_health.isNotEmpty) ...[
                        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          const Expanded(child: Overline('Module health')),
                          if (s.canUnder('reports.'))
                            Text('Reports',
                                style: T.body(color: T.brand700, weight: FontWeight.w700)
                                    .copyWith(fontSize: 12)),
                        ]),
                        const SizedBox(height: 8),
                        for (final h in _health) ...[
                          _HealthRow(
                            health: h,
                            onTap: hrefToModule.containsValue(h.key)
                                ? () => widget.onOpen(h.key)
                                : null,
                          ),
                          const SizedBox(height: 8),
                        ],
                      ],
                      if (_health.isEmpty)
                        const Empty('Nothing is assigned to you yet',
                            detail: 'Your administrator decides what you can open.'),
                    ],
                  ),
          ),
        ),
        widget.bottom,
      ]),
    );
  }
}

/// The one thing that is actually on this person right now.
class _Waiting extends StatelessWidget {
  const _Waiting({required this.value, required this.label, required this.tone, this.onTap});

  final String value;
  final String label;
  final Tone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(tone);
    return Panel(
      fill: c.fill,
      border: tone == Tone.warn ? T.warnLineStrong : c.line,
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: T.metric(26)),
        const SizedBox(height: 2),
        Text(label, style: T.caption(color: c.ink).copyWith(fontSize: 12)),
      ]),
    );
  }
}

class _HealthRow extends StatelessWidget {
  const _HealthRow({required this.health, this.onTap});

  final _Health health;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(health.tone);
    final right = health.rightTone == null ? null : toneOf(health.rightTone!);
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      onTap: onTap,
      child: Row(children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.fill, borderRadius: BorderRadius.circular(10)),
          child: Icon(health.icon, size: 19, color: c.ink),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(health.label, style: T.body(weight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(health.failed ? 'Could not be read' : health.detail,
                style: T.caption(color: health.failed ? T.badInk : T.muted)
                    .copyWith(fontSize: 12, fontWeight: FontWeight.w500)),
          ]),
        ),
        if (health.right != null && !health.failed)
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(health.right!, style: T.metric(19, color: right?.ink ?? T.navy950)),
            Text(health.rightLabel ?? '', style: T.overline().copyWith(fontSize: 10.5)),
          ]),
        if (onTap != null)
          const Padding(
            padding: EdgeInsets.only(left: 6),
            child: Icon(Icons.chevron_right_rounded, size: 20, color: T.chevron),
          ),
      ]),
    );
  }
}
