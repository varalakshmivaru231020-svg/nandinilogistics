import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/punch_model.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'earnings.dart';
import 'form_screen.dart';
import 'profile.dart';
import 'punch.dart';
import 'referrals.dart';
import 'report_screen.dart';

/// Where a home tile goes.
sealed class TileTarget {
  const TileTarget();
}

/// A list the server describes, opened in the shell (so the bottom bar stays).
class ListTarget extends TileTarget {
  const ListTarget(this.moduleKey, [this.query = const {}]);
  final String moduleKey;
  final Map<String, String> query;
}

/// A form the server describes.
class FormTarget extends TileTarget {
  const FormTarget(this.formKey, {this.recordId});
  final String formKey;
  final String? recordId;
}

/// A screen of the app's own, for something only a phone does.
class ScreenTarget extends TileTarget {
  const ScreenTarget(this.screen);
  final String screen;
}

class HomeTile {
  const HomeTile(this.id, this.label, this.icon, this.tone, this.target, {this.hint});
  final String id;
  final String label;
  final IconData icon;
  final Tone tone;
  final TileTarget target;

  /// The second line on a rider's quick action — "View records".
  final String? hint;
}

/// The tiles this person gets, by what they may do — never by role name, so a
/// role Admin has customised still gets the right ones (SOW §3.6–3.8).
///
/// A rider gets four quick actions and no more; referrals, incentives and
/// support live in the menu. Staff get the tiles for their lists.
List<HomeTile> homeTiles(Session s) {
  final rider = s.rider;
  final isRider = rider != null;
  final can = s.can;
  if (isRider) {
    return [
      if (s.canAny(const ['hr.attendance.view', 'hr.attendance.punch']))
        const HomeTile('attendance', 'Attendance', Icons.calendar_month_outlined, Tone.bad,
            ScreenTarget('punch'), hint: 'Monthly records'),
      if (can('payout.payout.view'))
        const HomeTile('earnings', 'My Earnings', Icons.currency_rupee_rounded, Tone.good,
            ScreenTarget('earnings'), hint: 'Payout history'),
      if (can('advance.advance.view'))
        const HomeTile('advances', 'Advances', Icons.account_balance_wallet_outlined, Tone.warn,
            ListTarget('advances'), hint: 'Request & track'),
      const HomeTile('notifications', 'Notifications', Icons.notifications_none_rounded, Tone.info,
          ScreenTarget('notifications'), hint: 'Announcements'),
    ];
  }
  return [
    // Staff punch from the attendance card; their tiles are their lists.
    if (can('hr.employee.view'))
      HomeTile('team', can('hr.employee.viewAll') ? 'Riders' : 'My team', Icons.groups_outlined,
          Tone.good, const ListTarget('hr/employees')),
    if (can('hr.attendance.view'))
      const HomeTile('attendance', 'Team attendance', Icons.event_available_outlined, Tone.good,
          ListTarget('hr/attendance')),
    if (can('hr.attendance.punch'))
      const HomeTile('punch', 'My attendance', Icons.calendar_month_outlined, Tone.info, ScreenTarget('punch')),
    if (can('advance.advance.approve'))
      const HomeTile('advanceApprovals', 'Advance approvals', Icons.fact_check_outlined, Tone.warn,
          ListTarget('advances', {'status': 'PENDING'})),
    if (can('sales.lead.create'))
      const HomeTile('newLead', 'New lead', Icons.person_add_alt_1_outlined, Tone.plum,
          FormTarget('sales/leads:create')),
    if (can('sales.lead.view'))
      const HomeTile('leads', 'Leads', Icons.person_search_outlined, Tone.plum, ListTarget('sales/leads')),
    if (can('sales.followUp.view'))
      const HomeTile('followUps', 'Follow-ups', Icons.phone_forwarded_outlined, Tone.warn,
          ListTarget('sales/follow-ups')),
    if (s.canAny(const [
      'hr.employee.acceptOnboarding',
      'hr.employee.rejectOnboarding',
      'hr.employee.submitOnboarding',
    ]))
      const HomeTile('onboarding', 'Onboarding', Icons.how_to_reg_outlined, Tone.info,
          ListTarget('hr/onboarding')),
    if (can('payout.payout.view'))
      const HomeTile('payouts', 'Payouts', Icons.payments_outlined, Tone.good, ListTarget('payouts')),
    if (can('hr.referral.view'))
      const HomeTile('referrals', 'Referrals', Icons.group_add_outlined, Tone.plum,
          ListTarget('hr/referrals')),
    if (can('reports.teamLeader.view'))
      const HomeTile('tlReport', 'TL report', Icons.bar_chart_outlined, Tone.info,
          ScreenTarget('report:teamLeader')),
    if (can('reports.teleCallerDaily.view'))
      const HomeTile('dailySummary', 'Daily summary', Icons.insights_outlined, Tone.info,
          ScreenTarget('report:teleCallerDaily')),
    if (can('task.task.view'))
      const HomeTile('tasks', 'Tasks', Icons.check_box_outlined, Tone.info, ListTarget('tasks')),
    const HomeTile('notifications', 'Notifications', Icons.notifications_none_rounded, Tone.draft,
        ScreenTarget('notifications')),
  ];
}

/// Home: who you are and what you can do from here.
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
    this.onRefreshSession,
  });

  final Api api;
  final Session session;
  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final int? unread;

  /// Opens a list in the shell, with any filters it should start on.
  final void Function(String moduleKey, Map<String, String> query) onOpen;
  final Widget bottom;

  /// Re-reads /me, so the onboarding banner follows the server.
  final Future<void> Function()? onRefreshSession;

  @override
  State<DashboardScreen> createState() => DashboardScreenState();
}

num _n(Map<String, dynamic>? p, String k) => (p?[k] as num?) ?? num.tryParse('${p?[k]}') ?? 0;

class DashboardScreenState extends State<DashboardScreen> {
  Uint8List? _photo;
  List<Map<String, dynamic>> _payouts = const [];
  String? _payoutProblem;
  List<Map<String, dynamic>> _activity = const [];
  late final PunchModel _punch = PunchModel(widget.api);
  String? _lastNotice;

  Session get _s => widget.session;
  bool get _canPunch => _s.can('hr.attendance.punch');

  @override
  void initState() {
    super.initState();
    _punch.addListener(_onPunch);
    _load();
  }

  @override
  void dispose() {
    _punch.removeListener(_onPunch);
    _punch.dispose();
    super.dispose();
  }

  void _onPunch() {
    if (!mounted) return;
    setState(() {});
    final msg = _punch.done ?? _punch.error;
    if (msg != null && msg != _lastNotice) {
      _lastNotice = msg;
      notify(context, msg);
    }
  }

  Future<void> _load() async {
    final r = _s.rider;
    if (_canPunch) _punch.load();
    if (r == null) return;
    final photo = widget.api.file(r.photoUrl ?? '/api/mobile/v1/photo');
    if (_s.can('payout.payout.view')) {
      final res = await widget.api.get('/list/payouts', query: const {'page': '1', 'pageSize': '60'});
      if (mounted) {
        setState(() {
          if (res.ok) {
            _payouts = ListPage.from(res.data!).rows;
            _payoutProblem = _payouts.isEmpty ? 'No payout posted yet.' : null;
          } else {
            _payoutProblem = res.missing ? notOnServer : res.error;
          }
        });
      }
    }
    final notes = await widget.api.get('/notifications');
    if (mounted && notes.ok) {
      setState(() {
        _activity = ((notes.data!['rows'] as List?) ?? const []).cast<Map<String, dynamic>>().take(3).toList();
      });
    }
    final got = await photo;
    if (mounted && got != null) setState(() => _photo = Uint8List.fromList(got.bytes));
  }

  Future<void> _refresh() async {
    await widget.onRefreshSession?.call();
    await _load();
  }

  Future<void> _go(HomeTile t) async {
    final nav = Navigator.of(context);
    switch (t.target) {
      case ListTarget(:final moduleKey, :final query):
        widget.onOpen(moduleKey, query);
      case FormTarget(:final formKey, :final recordId):
        await nav.push(MaterialPageRoute<void>(
            builder: (_) => FormScreen(api: widget.api, formKey: formKey, recordId: recordId)));
      case ScreenTarget(:final screen):
        if (screen == 'notifications') {
          widget.onNotifications();
          return;
        }
        await nav.push(MaterialPageRoute<void>(builder: (_) => _screen(screen)));
    }
    if (mounted) _refresh();
  }

  Widget _screen(String id) {
    if (id.startsWith('report:')) {
      final key = id.substring('report:'.length);
      return ReportScreen(
          api: widget.api, reportKey: key, title: key == 'teamLeader' ? 'TL report' : 'Daily summary');
    }
    return switch (id) {
      'punch' => PunchScreen(api: widget.api),
      'earnings' => EarningsScreen(api: widget.api, session: _s),
      'referFriend' => ReferralScreen(api: widget.api, session: _s),
      _ => ProfileScreen(
          session: _s,
          onRequestChange: _s.can('hr.employee.requestEdit') && _s.rider != null
              ? () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => FormScreen(
                      api: widget.api, formKey: 'hr/profile:edit', recordId: _s.rider!.id)))
              : null,
        ),
    };
  }

  Future<void> _confirmPunch() async {
    final out = _punch.punchedIn;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(T.rCard)),
        title: Text(out ? 'Punch out now?' : 'Punch in now?'),
        content: Text(out
            ? 'This closes your attendance for today. Your location is recorded.'
            : 'This marks you present for today. Your location is recorded.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not yet')),
          TextButton(
            key: const Key('confirm-punch'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(out ? 'Punch out' : 'Punch in',
                style: const TextStyle(color: T.accent700, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (yes == true) await _punch.punch();
  }

  void _openAttendance() =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PunchScreen(api: widget.api))).then((_) {
        if (mounted) _refresh();
      });

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final rider = s.rider;
    final tiles = homeTiles(s);
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        _header(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 24),
              children: [
                Text('Home', style: T.screenTitle()),
                const SizedBox(height: 2),
                Text(rider != null ? 'Welcome to your rider dashboard.' : 'Welcome to your dashboard.',
                    style: T.secondaryText()),
                const SizedBox(height: 14),
                _welcomeCard(),
                if (_canPunch) ...[
                  const SizedBox(height: T.cardGap),
                  _attendanceCard(),
                ],
                if (rider != null && s.can('payout.payout.view')) ...[
                  const SizedBox(height: T.cardGap),
                  _earningsCard(),
                ],
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 20, 2, 10),
                  child: Text('Quick Actions', style: T.section()),
                ),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: T.cardGap,
                  crossAxisSpacing: T.cardGap,
                  childAspectRatio: 1.55,
                  children: [for (final t in tiles) _tile(t)],
                ),
                if (_canPunch && _punch.today != null) ...[
                  const SizedBox(height: 20),
                  _attendancePreview(),
                ],
                if (rider != null && _activity.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
                    child: Row(children: [
                      Text('Recent Activity', style: T.section()),
                      const Spacer(),
                      _link('View all', widget.onNotifications),
                    ]),
                  ),
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      for (var i = 0; i < _activity.length; i++) ...[
                        if (i > 0) const Divider(height: 1, thickness: 1, color: T.line, indent: 58),
                        _activityRow(_activity[i]),
                      ],
                    ]),
                  ),
                ],
              ],
            ),
          ),
        ),
        widget.bottom,
      ]),
    );
  }

  /// The company header: menu, the logo and name on the left, the bell on
  /// the right. Compact, and nothing else in it.
  Widget _header() {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(8, top + 6, 8, 8),
      decoration: const BoxDecoration(
        color: T.card,
        border: Border(bottom: BorderSide(color: T.line)),
      ),
      child: Row(children: [
        IconButton(
          tooltip: 'Menu',
          onPressed: widget.onMenu,
          icon: const Icon(Icons.menu_rounded, color: T.ink),
          visualDensity: VisualDensity.compact,
        ),
        Image.asset('assets/brand/nandini-logo.png',
            height: 30,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Icon(Icons.two_wheeler_rounded, size: 26, color: T.accent500)),
        const SizedBox(width: 8),
        Expanded(
          child: Text('NANDINI LOGISTICS',
              style: T.section().copyWith(fontSize: 13.5, letterSpacing: 1.1),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ),
        Stack(clipBehavior: Clip.none, children: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: widget.onNotifications,
            icon: const Icon(Icons.notifications_none_rounded, color: T.ink),
          ),
          if ((widget.unread ?? 0) > 0)
            Positioned(
              right: 10,
              top: 10,
              child: Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: T.accent500,
                  shape: BoxShape.circle,
                  border: Border.all(color: T.card, width: 1.5),
                ),
              ),
            ),
        ]),
      ]),
    );
  }

  Widget _link(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: T.caption(color: T.accent700).copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(width: 2),
          const Icon(Icons.arrow_forward_rounded, size: 14, color: T.accent700),
        ]),
      );

  /// "Welcome back, Suresh!" — or "Welcome to Nandini Logistics!" the first
  /// time this phone signs in — with the photo or initials, Rider ID,
  /// location and status.
  Widget _welcomeCard() {
    final s = _s;
    final r = s.rider;
    final name = (r?.name ?? s.name).trim();
    final first = name.split(' ').first;
    final place = r?.location ?? (r == null || r.companies.isEmpty ? null : r.companies.join(', '));
    final (String? banner, Tone tone) = switch (r?.onboardingStatus) {
      'DRAFT' => ('Your form is being prepared', Tone.info),
      'SUBMITTED' => ('Under review', Tone.warn),
      'REJECTED' => (
          'Not accepted${r?.rejectionReason == null ? '' : ': ${r!.rejectionReason}'}. Contact your tele-caller.',
          Tone.bad
        ),
      _ => (null, Tone.good),
    };
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: T.accent100,
              shape: BoxShape.circle,
              border: Border.all(color: T.accent500, width: 2),
              image: _photo == null ? null : DecorationImage(image: MemoryImage(_photo!), fit: BoxFit.cover),
            ),
            child: _photo == null
                ? Text(s.initials, style: T.metric(18, color: T.accent700).copyWith(height: 1))
                : null,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                s.returning ? 'Welcome back, ${first.isEmpty ? 'there' : first}!' : 'Welcome to Nandini Logistics!',
                key: const Key('greeting'),
                style: T.section().copyWith(fontSize: 17),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 3),
              if (r != null)
                Text(r.riderId == null ? 'Rider ID pending' : 'Rider ID ${r.riderId}',
                    key: const Key('rider-id'),
                    style: T.num(12.5, color: T.secondary, weight: FontWeight.w700))
              else
                Text(s.roleNames.isEmpty ? (s.isSuperAdmin ? 'Super admin' : 'Staff') : s.roleNames.first,
                    style: T.caption(color: T.secondary)),
              if (place != null) ...[
                const SizedBox(height: 3),
                Row(children: [
                  const Icon(Icons.location_on_outlined, size: 14, color: T.accent500),
                  const SizedBox(width: 3),
                  Flexible(child: Text(place, style: T.caption(color: T.secondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
                ]),
              ],
            ]),
          ),
          if (r != null)
            Pill(r.isActive ? 'Active' : 'Inactive', compact: true, tone: r.isActive ? Tone.good : Tone.bad),
        ]),
        if (banner != null) ...[
          const SizedBox(height: 10),
          Alert(banner, key: const Key('onboarding-banner'), tone: tone),
        ],
      ]),
    );
  }

  /// Today's attendance with the one valid action: Punch In, Punch Out, or
  /// Completed. The working duration counts from the punch-in.
  Widget _attendanceCard() {
    final m = _punch;
    final today = m.today;
    final inAt = DateTime.tryParse('${today?['punchInAt'] ?? ''}');
    final outAt = DateTime.tryParse('${today?['punchOutAt'] ?? ''}');
    final worked = inAt == null ? null : (outAt ?? DateTime.now()).difference(inAt).inMinutes;
    final (String state, Tone tone) = m.loadError != null
        ? ('Unavailable', Tone.warn)
        : !m.punchedIn
            ? ('Not punched in', Tone.draft)
            : !m.punchedOut
                ? ('On duty', Tone.good)
                : ('Completed', Tone.good);
    return Panel(
      key: const Key('attendance-card'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Overline("Today's attendance")),
          const SizedBox(width: 8),
          Pill(state, key: const Key('attendance-state'), compact: true, tone: tone),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _fact('Punch in', inAt == null ? '—' : clock12(today!['punchInAt'])),
          _fact(m.punchedOut ? 'Punch out' : 'On duty for',
              m.punchedOut ? clock12(today!['punchOutAt']) : (worked == null ? '—' : duration(worked))),
          _fact('Hours', worked == null ? '—' : duration(worked)),
        ]),
        const SizedBox(height: 14),
        if (m.loadError != null)
          Alert(m.loadError!, tone: Tone.warn)
        else if (m.loading && today == null)
          const Center(
              child: Padding(
                  padding: EdgeInsets.all(6),
                  child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))))
        else if (!m.punchedIn)
          Btn('Punch In',
              key: const Key('punch-action'),
              icon: Icons.login_rounded,
              expand: true,
              height: 50,
              busy: m.busy,
              onPressed: m.busy ? null : _confirmPunch)
        else if (!m.punchedOut)
          Btn('Punch Out',
              key: const Key('punch-action'),
              icon: Icons.logout_rounded,
              emphasis: Emphasis.outline,
              expand: true,
              height: 50,
              busy: m.busy,
              onPressed: m.busy ? null : _confirmPunch)
        else
          Container(
            key: const Key('punch-done'),
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: T.goodTint, borderRadius: BorderRadius.circular(T.rButton)),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.verified_rounded, size: 18, color: T.goodInk),
              const SizedBox(width: 6),
              Text('Shift completed', style: T.buttonLabel(color: T.goodInk)),
            ]),
          ),
        if (m.error != null) ...[
          const SizedBox(height: 10),
          Alert(m.error!, tone: Tone.warn),
        ],
      ]),
    );
  }

  Widget _fact(String label, String value) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: T.caption(color: T.muted)),
          const SizedBox(height: 2),
          Text(value, style: T.num(15, weight: FontWeight.w800), maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      );

  /// This week's earnings on a white card: the latest posted payout, what has
  /// been paid and what is on hold across the posted lines, and the last
  /// payout period. Nothing is projected.
  Widget _earningsCard() {
    final latest = _payouts.isEmpty ? null : _payouts.first;
    num paid = 0;
    num held = 0;
    for (final p in _payouts) {
      final st = '${p["status"] ?? ""}'.toLowerCase();
      if (st.contains('hold')) {
        held += _n(p, 'finalPayout');
      } else {
        paid += _n(p, 'finalPayout');
      }
    }
    return Panel(
      key: const Key('payout-card'),
      padding: EdgeInsets.zero,
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => EarningsScreen(api: widget.api, session: _s))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: const BoxDecoration(
            border: Border(left: BorderSide(color: T.accent500, width: 4)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Overline("This week's earnings"),
              const Spacer(),
              if (latest != null)
                Pill('${latest["status"] ?? ""}',
                    compact: true,
                    tone: '${latest["status"] ?? ""}'.toLowerCase().contains('hold') ? Tone.warn : Tone.good),
            ]),
            const SizedBox(height: 6),
            if (latest == null)
              Text(_payoutProblem ?? 'Loading…', style: T.secondaryText())
            else ...[
              Text(money(_n(latest, 'finalPayout')), style: T.metric(30, color: T.accent700)),
              const SizedBox(height: 2),
              Text('${shortDate(latest["periodFrom"])} – ${shortDate(latest["periodTo"])}',
                  style: T.caption(color: T.muted)),
            ],
          ]),
        ),
        if (latest != null) ...[
          const Divider(height: 1, thickness: 1, color: T.line),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(children: [
              _fact('Paid', money(paid, short: true)),
              _fact('On hold', money(held, short: true)),
              _fact('Last payout', shortDate(latest['periodTo'])),
            ]),
          ),
        ],
        const Divider(height: 1, thickness: 1, color: T.line),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(children: [
            Text('View Earnings Summary', style: T.body(weight: FontWeight.w700, color: T.accent700)),
            const Spacer(),
            const Icon(Icons.arrow_forward_rounded, size: 16, color: T.accent700),
          ]),
        ),
      ]),
    );
  }

  /// Under the quick actions: today in one line, and the way to the month.
  Widget _attendancePreview() {
    final today = _punch.today!;
    final inAt = DateTime.tryParse('${today['punchInAt'] ?? ''}');
    final outAt = DateTime.tryParse('${today['punchOutAt'] ?? ''}');
    final worked = inAt == null ? null : (outAt ?? DateTime.now()).difference(inAt).inMinutes;
    return Panel(
      key: const Key('attendance-preview'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      onTap: _openAttendance,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text("Today's attendance", style: T.body(weight: FontWeight.w700)),
          const Spacer(),
          _link('View full attendance', _openAttendance),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          _fact('Punch in', inAt == null ? '—' : clock12(today['punchInAt'])),
          _fact('Punch out', outAt == null ? (inAt == null ? '—' : 'Not yet') : clock12(today['punchOutAt'])),
          _fact('Hours logged', worked == null ? '—' : duration(worked)),
          _fact('Status', !_punch.punchedIn ? 'Pending' : (_punch.punchedOut ? 'Present' : 'On duty')),
        ]),
      ]),
    );
  }

  Widget _activityRow(Map<String, dynamic> row) {
    final kind = '${row["kind"] ?? ""}'.toUpperCase();
    final icon = kind.contains('PAYOUT')
        ? Icons.payments_outlined
        : kind.contains('ADVANCE')
            ? Icons.account_balance_wallet_outlined
            : kind.contains('APPROV')
                ? Icons.fact_check_outlined
                : Icons.notifications_none_rounded;
    return InkWell(
      onTap: widget.onNotifications,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
        child: Row(children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: T.neutralTint, borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, size: 17, color: T.secondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${row["title"] ?? ""}', style: T.body(weight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(shortDate(row['createdAt']), style: T.caption(color: T.muted)),
            ]),
          ),
          const Icon(Icons.chevron_right_rounded, color: T.chevron),
        ]),
      ),
    );
  }

  /// A quick action: white, bordered, the icon on a small tinted square.
  Widget _tile(HomeTile t) {
    final c = toneOf(t.tone);
    final badge = t.id == 'notifications' ? widget.unread : null;
    return Panel(
      key: Key('tile-${t.id}'),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      onTap: () => _go(t),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.fill, borderRadius: BorderRadius.circular(11)),
            child: Icon(t.icon, size: 20, color: c.ink),
          ),
          const Spacer(),
          if (badge != null && badge > 0)
            Pill('$badge', compact: true, solid: (bg: T.accent500, ink: Colors.white))
          else
            const Icon(Icons.chevron_right_rounded, size: 18, color: T.chevron),
        ]),
        const Spacer(),
        Text(t.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: T.body(weight: FontWeight.w800).copyWith(fontSize: 14.5)),
        if (t.hint != null) Text(t.hint!, style: T.caption(color: T.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
      ]),
    );
  }
}
