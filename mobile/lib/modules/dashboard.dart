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
            ScreenTarget('punch'), hint: 'View records'),
      if (can('payout.payout.view'))
        const HomeTile('earnings', 'My Earnings', Icons.currency_rupee_rounded, Tone.good,
            ScreenTarget('earnings'), hint: 'View details'),
      if (can('advance.advance.view'))
        const HomeTile('advances', 'Advances', Icons.account_balance_wallet_outlined, Tone.warn,
            ListTarget('advances'), hint: 'Request & track'),
      const HomeTile('notifications', 'Notifications', Icons.notifications_none_rounded, Tone.info,
          ScreenTarget('notifications'), hint: 'What changed'),
    ];
  }
  return [
    if (can('hr.attendance.punch'))
      const HomeTile('punch', 'Punch in / out', Icons.fingerprint_rounded, Tone.good, ScreenTarget('punch')),
    // §3.7 Team Leader and §3.8 Tele-caller
    if (can('hr.employee.view'))
      HomeTile('team', can('hr.employee.viewAll') ? 'Riders' : 'My team', Icons.groups_outlined,
          Tone.good, const ListTarget('hr/employees')),
    if (can('hr.attendance.view'))
      const HomeTile('attendance', 'Team attendance', Icons.event_available_outlined, Tone.good,
          ListTarget('hr/attendance')),
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

class DashboardScreenState extends State<DashboardScreen> {
  Uint8List? _photo;
  Map<String, dynamic>? _payout;
  String? _payoutProblem;
  List<Map<String, dynamic>> _activity = const [];
  late final PunchModel _punch = PunchModel(widget.api);

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

  String? _lastNotice;

  Future<void> _load() async {
    final r = _s.rider;
    if (_canPunch) _punch.load();
    if (r == null) return;
    final photo = widget.api.file(r.photoUrl ?? '/api/mobile/v1/photo');
    if (_s.can('payout.payout.view')) {
      final res = await widget.api.get('/list/payouts', query: const {'page': '1', 'pageSize': '1'});
      if (mounted) {
        setState(() {
          if (res.ok) {
            final rows = ListPage.from(res.data!).rows;
            _payout = rows.isEmpty ? null : rows.first;
            _payoutProblem = rows.isEmpty ? 'No payout posted yet.' : null;
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

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final rider = s.rider;
    final tiles = homeTiles(s);
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Home',
          subtitle: rider != null
              ? null
              : (s.roleNames.isEmpty ? (s.isSuperAdmin ? 'Super admin' : 'No role') : s.roleNames.first),
          onMenu: widget.onMenu,
          actions: [
            BarButton(
              icon: Icons.notifications_none_rounded,
              label: 'Notifications',
              dot: (widget.unread ?? 0) > 0,
              onTap: widget.onNotifications,
            ),
            if (_canPunch) _punchButton(),
          ],
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(T.gutter, 8, T.gutter, 24),
              children: [
                if (rider != null) ...[
                  _riderGreeting(rider),
                  const SizedBox(height: T.cardGap),
                  if (s.can('payout.payout.view')) ...[
                    _payoutCard(),
                    const SizedBox(height: T.cardGap),
                  ],
                ] else ...[
                  _staffGreeting(s),
                  const SizedBox(height: 18),
                ],
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 8, 2, 10),
                  child: Text('Quick Actions', style: T.section()),
                ),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: T.cardGap,
                  crossAxisSpacing: T.cardGap,
                  childAspectRatio: rider != null ? 1.6 : 1.45,
                  children: [for (final t in tiles) rider != null ? _quickAction(t) : _tile(t)],
                ),
                if (rider != null && _canPunch) ...[
                  const SizedBox(height: T.cardGap),
                  _attendanceCard(),
                ],
                if (rider != null && _activity.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
                    child: Row(children: [
                      Text('Recent Activity', style: T.section()),
                      const Spacer(),
                      InkWell(
                        onTap: widget.onNotifications,
                        child: Row(children: [
                          Text('See all', style: T.caption(color: T.accent700).copyWith(fontWeight: FontWeight.w700)),
                          const Icon(Icons.arrow_forward_rounded, size: 14, color: T.accent700),
                        ]),
                      ),
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

  /// The red Punch In / Punch Out button beside the bell. Once the day is
  /// done it turns into a quiet "Done" mark.
  Widget _punchButton() {
    final label = _punch.buttonLabel;
    if (_punch.loading && _punch.today == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 8),
        child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (label == null) {
      return Container(
        key: const Key('punch-done'),
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(color: T.goodTint, borderRadius: BorderRadius.circular(T.rPill)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.check_circle_rounded, size: 16, color: T.goodInk),
          const SizedBox(width: 6),
          Text('Done', style: T.buttonLabel(color: T.goodInk).copyWith(fontSize: 12.5)),
        ]),
      );
    }
    final out = _punch.punchedIn;
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Semantics(
        button: true,
        label: label,
        child: InkWell(
          key: const Key('bar-punch'),
          onTap: _punch.busy ? null : _confirmPunch,
          borderRadius: BorderRadius.circular(T.rPill),
          child: Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: out ? T.accent100 : T.accent500,
              borderRadius: BorderRadius.circular(T.rPill),
              boxShadow: out ? null : T.glow,
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (_punch.busy)
                SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: out ? T.accent700 : Colors.white))
              else
                Icon(out ? Icons.logout_rounded : Icons.play_arrow_rounded,
                    size: 18, color: out ? T.accent700 : Colors.white),
              const SizedBox(width: 6),
              Text(label, style: T.buttonLabel(color: out ? T.accent700 : Colors.white).copyWith(fontSize: 13)),
            ]),
          ),
        ),
      ),
    );
  }

  /// "Good Morning, Suresh!" with the photo, Rider ID and where they ride.
  Widget _riderGreeting(RiderProfile r) {
    final first = r.name.trim().split(' ').first;
    final place = r.location ?? (r.companies.isEmpty ? null : r.companies.join(', '));
    final (String? banner, Tone tone) = switch (r.onboardingStatus) {
      'DRAFT' => ('Your form is being prepared', Tone.info),
      'SUBMITTED' => ('Under review', Tone.warn),
      'REJECTED' => (
          'Not accepted${r.rejectionReason == null ? '' : ': ${r.rejectionReason}'}. Contact your tele-caller.',
          Tone.bad
        ),
      _ => (null, Tone.good),
    };
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(T.rCard),
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [T.accent100, Color(0xFFFFF7F7)],
        ),
        border: Border.all(color: const Color(0xFFF6D9DB)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.wb_sunny_rounded, size: 18, color: T.warn),
                const SizedBox(width: 6),
                Text(greetingFor(DateTime.now()), style: T.caption(color: T.accent700).copyWith(fontWeight: FontWeight.w700)),
              ]),
              const SizedBox(height: 4),
              Text('${first.isEmpty ? 'there' : first}!',
                  key: const Key('greeting'),
                  style: T.display().copyWith(fontSize: 24, height: 1.1),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Text(r.riderId == null ? 'Rider ID pending' : 'Rider ID ${r.riderId}',
                  key: const Key('rider-id'),
                  style: T.num(12.5, color: T.accent700, weight: FontWeight.w700)),
              if (place != null) ...[
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.location_on_rounded, size: 14, color: T.accent500),
                  const SizedBox(width: 3),
                  Flexible(child: Text(place, style: T.caption(color: T.secondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
                ]),
              ],
            ]),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: T.soft),
            child: CircleAvatar(
              radius: 34,
              backgroundColor: T.accent100,
              backgroundImage: _photo == null ? null : MemoryImage(_photo!),
              child: _photo == null ? const Icon(Icons.person_rounded, size: 32, color: T.accent700) : null,
            ),
          ),
        ]),
        if (banner != null) ...[
          const SizedBox(height: 10),
          Alert(banner, key: const Key('onboarding-banner'), tone: tone),
        ],
      ]),
    );
  }

  /// Staff get the greeting as a line: "Hey Priya, here's your day."
  Widget _staffGreeting(Session s) {
    final first = s.name.trim().split(' ').first;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(text: 'Hey ${first.isEmpty ? 'there' : first},\n'),
          TextSpan(text: "here's your day.", style: T.hero(color: T.accent500)),
        ]),
        key: const Key('greeting'),
        style: T.hero(),
      ),
    );
  }

  Widget _payoutCard() {
    final p = _payout;
    num n(String k) => (p?[k] as num?) ?? num.tryParse('${p?[k]}') ?? 0;
    final status = '${p?["status"] ?? ""}';
    final held = status.toLowerCase().contains('hold');
    // The hero card: dark red, with the week's figure in white — the one
    // number a rider opens the app for. It is the latest posted payout.
    return Panel(
      key: const Key('payout-card'),
      fill: T.accent700,
      border: T.accent700,
      padding: EdgeInsets.zero,
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => EarningsScreen(api: widget.api, session: _s))),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(T.rCard),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFC8303A), Color(0xFF8E1F28)],
            ),
          ),
          child: Stack(children: [
            Positioned(
              right: -30,
              top: -50,
              child: Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.06),
                ),
              ),
            ),
            const Positioned(
              right: 18,
              top: 18,
              child: Icon(Icons.trending_up_rounded, size: 40, color: Colors.white24),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Overline("THIS WEEK'S EARNINGS", color: Colors.white.withValues(alpha: 0.8))),
                  if (p != null)
                    Pill(status,
                        compact: true,
                        solid: held
                            ? (bg: T.warn, ink: Colors.white)
                            : (bg: T.good, ink: Colors.white)),
                ]),
                const SizedBox(height: 10),
                if (p == null)
                  Text(_payoutProblem ?? 'Loading…', style: T.secondaryText(color: Colors.white70))
                else ...[
                  Text(money(n('finalPayout')), style: T.metric(34, color: Colors.white)),
                  const SizedBox(height: 2),
                  Text('${shortDate(p["periodFrom"])} – ${shortDate(p["periodTo"])}',
                      style: T.caption(color: Colors.white70)),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(T.rControl),
                    ),
                    child: Row(children: [
                      for (final (label, key) in const [
                        ('Total', 'totalPayout'),
                        ('Advance', 'advance'),
                        ('Bike rent', 'bikeRental'),
                        ('TDS', 'tds'),
                      ])
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(label, style: T.caption(color: Colors.white70).copyWith(fontSize: 11)),
                            Text(money(n(key), short: true),
                                style: T.num(12.5, color: Colors.white, weight: FontWeight.w700),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ]),
                        ),
                    ]),
                  ),
                ],
                const SizedBox(height: 12),
                Row(children: [
                  Text('See earnings summary', style: T.caption(color: Colors.white)),
                  const SizedBox(width: 4),
                  const Icon(Icons.arrow_forward_rounded, size: 14, color: Colors.white),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  /// Today's attendance, from the same model the header button uses.
  Widget _attendanceCard() {
    final m = _punch;
    final (String state, String detail, Tone tone, IconData icon) = !m.punchedIn
        ? ('Not punched in', 'Tap Punch In at the top when you start.', Tone.draft, Icons.schedule_rounded)
        : !m.punchedOut
            ? ('Punched In', 'Punch In Time: ${clock12(m.today!['punchInAt'])}', Tone.good, Icons.check_circle_rounded)
            : ('Done for today', '${clock12(m.today!['punchInAt'])} – ${clock12(m.today!['punchOutAt'])}', Tone.good, Icons.verified_rounded);
    final c = toneOf(tone);
    return Panel(
      key: const Key('attendance-card'),
      fill: tone == Tone.good ? T.goodTint : null,
      border: tone == Tone.good ? T.goodLine : null,
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: tone == Tone.good ? T.good : c.fill, shape: BoxShape.circle),
          child: Icon(icon, size: 22, color: tone == Tone.good ? Colors.white : c.ink),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text("Today's Attendance", style: T.caption(color: T.secondary)),
            Text(state, key: const Key('attendance-state'), style: T.body(weight: FontWeight.w800)),
            Text(detail, style: T.caption(color: T.muted)),
          ]),
        ),
        if (m.punchedIn && !m.punchedOut)
          TextButton.icon(
            key: const Key('card-punch-out'),
            onPressed: m.busy ? null : _confirmPunch,
            icon: const Icon(Icons.logout_rounded, size: 16),
            label: const Text('Punch Out'),
            style: TextButton.styleFrom(
              foregroundColor: T.accent700,
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(T.rPill), side: const BorderSide(color: T.accent300)),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
          ),
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
            decoration: const BoxDecoration(color: T.goodTint, shape: BoxShape.circle),
            child: Icon(icon, size: 17, color: T.goodInk),
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

  /// A rider's quick action: a pastel square with the icon, the name and a hint.
  Widget _quickAction(HomeTile t) {
    final c = toneOf(t.tone);
    final badge = t.id == 'notifications' ? widget.unread : null;
    return Panel(
      key: Key('tile-${t.id}'),
      fill: c.fill,
      border: c.fill,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      onTap: () => _go(t),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            child: Icon(t.icon, size: 21, color: c.ink),
          ),
          const Spacer(),
          if (badge != null && badge > 0)
            Pill('$badge', compact: true, solid: (bg: T.accent500, ink: Colors.white)),
        ]),
        const Spacer(),
        Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: T.body(weight: FontWeight.w800, color: T.ink).copyWith(fontSize: 14.5)),
        if (t.hint != null) Text(t.hint!, style: T.caption(color: T.secondary)),
      ]),
    );
  }

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
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.fill, shape: BoxShape.circle),
            child: Icon(t.icon, size: 20, color: c.ink),
          ),
          const Spacer(),
          if (badge != null && badge > 0)
            Pill('$badge', compact: true, solid: (bg: T.accent500, ink: Colors.white))
          else
            const Icon(Icons.arrow_outward_rounded, size: 16, color: T.chevron),
        ]),
        const Spacer(),
        Text(t.label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: T.body(weight: FontWeight.w700).copyWith(fontSize: 14)),
      ]),
    );
  }
}
