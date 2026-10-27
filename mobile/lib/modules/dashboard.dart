import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'form_screen.dart';
import 'id_card.dart';
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
  const HomeTile(this.id, this.label, this.icon, this.tone, this.target);
  final String id;
  final String label;
  final IconData icon;
  final Tone tone;
  final TileTarget target;
}

/// The tiles this person gets, by what they may do — never by role name, so a
/// role Admin has customised still gets the right ones (SOW §3.6–3.8).
List<HomeTile> homeTiles(Session s) {
  final rider = s.rider;
  final isRider = rider != null;
  final can = s.can;
  return [
    // §3.6 Rider
    if (isRider && can('hr.employee.idCard'))
      const HomeTile('idCard', 'ID card', Icons.badge_outlined, Tone.info, ScreenTarget('idCard')),
    if (can('hr.attendance.punch'))
      const HomeTile('punch', 'Punch in / out', Icons.fingerprint_rounded, Tone.good, ScreenTarget('punch')),
    if (isRider && can('advance.advance.view'))
      const HomeTile('advances', 'Advances', Icons.account_balance_wallet_outlined, Tone.warn,
          ListTarget('advances')),
    if (isRider && can('advance.advance.create'))
      const HomeTile('requestAdvance', 'Request advance', Icons.request_quote_outlined, Tone.warn,
          FormTarget('advances:create')),
    if (isRider)
      const HomeTile('referFriend', 'Refer a friend', Icons.group_add_outlined, Tone.plum,
          ScreenTarget('referFriend')),
    if (isRider)
      const HomeTile('referRider', 'Refer a rider', Icons.person_add_alt_outlined, Tone.plum,
          FormTarget('sales/leads:refer')),
    if (isRider)
      const HomeTile('profile', 'My profile', Icons.person_outline_rounded, Tone.draft,
          ScreenTarget('profile')),

    // §3.7 Team Leader and §3.8 Tele-caller
    if (!isRider && can('hr.employee.view'))
      HomeTile('team', can('hr.employee.viewAll') ? 'Riders' : 'My team', Icons.groups_outlined,
          Tone.good, const ListTarget('hr/employees')),
    if (!isRider && can('hr.attendance.view'))
      const HomeTile('attendance', 'Team attendance', Icons.event_available_outlined, Tone.good,
          ListTarget('hr/attendance')),
    if (can('advance.advance.approve'))
      const HomeTile('advanceApprovals', 'Advance approvals', Icons.fact_check_outlined, Tone.warn,
          ListTarget('advances', {'status': 'PENDING'})),
    if (!isRider && can('sales.lead.create'))
      const HomeTile('newLead', 'New lead', Icons.person_add_alt_1_outlined, Tone.plum,
          FormTarget('sales/leads:create')),
    if (!isRider && can('sales.lead.view'))
      const HomeTile('leads', 'Leads', Icons.person_search_outlined, Tone.plum, ListTarget('sales/leads')),
    if (!isRider && can('sales.followUp.view'))
      const HomeTile('followUps', 'Follow-ups', Icons.phone_forwarded_outlined, Tone.warn,
          ListTarget('sales/follow-ups')),
    if (!isRider &&
        s.canAny(const [
          'hr.employee.acceptOnboarding',
          'hr.employee.rejectOnboarding',
          'hr.employee.submitOnboarding',
        ]))
      const HomeTile('onboarding', 'Onboarding', Icons.how_to_reg_outlined, Tone.info,
          ListTarget('hr/onboarding')),
    if (!isRider && can('payout.payout.view'))
      const HomeTile('payouts', 'Payouts', Icons.payments_outlined, Tone.good, ListTarget('payouts')),
    if (!isRider && can('hr.referral.view'))
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

  Session get _s => widget.session;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = _s.rider;
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
      'idCard' => IdCardScreen(api: widget.api),
      'punch' => PunchScreen(api: widget.api),
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

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final tiles = homeTiles(s);
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: s.rider != null ? 'Hello, ${s.rider!.name.split(' ').first}' : 'Home',
          subtitle: s.roleNames.isEmpty ? (s.isSuperAdmin ? 'Super admin' : 'No role') : s.roleNames.first,
          onMenu: widget.onMenu,
          actions: [
            BarButton(
              icon: Icons.notifications_none_rounded,
              label: 'Notifications',
              dot: (widget.unread ?? 0) > 0,
              onTap: widget.onNotifications,
            ),
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _refresh),
          ],
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 24),
              children: [
                if (s.rider != null) ...[
                  _header(s.rider!),
                  const SizedBox(height: 12),
                  if (s.can('payout.payout.view')) ...[
                    _payoutCard(),
                    const SizedBox(height: 12),
                  ],
                ],
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.6,
                  children: [for (final t in tiles) _tile(t)],
                ),
              ],
            ),
          ),
        ),
        widget.bottom,
      ]),
    );
  }

  Widget _header(RiderProfile r) {
    final (String? banner, Tone tone) = switch (r.onboardingStatus) {
      'DRAFT' => ('Your form is being prepared', Tone.info),
      'SUBMITTED' => ('Under review', Tone.warn),
      'REJECTED' => (
          'Not accepted${r.rejectionReason == null ? '' : ': ${r.rejectionReason}'}. Contact your tele-caller.',
          Tone.bad
        ),
      _ => (null, Tone.good),
    };
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: T.brand100,
            backgroundImage: _photo == null ? null : MemoryImage(_photo!),
            child: _photo == null ? const Icon(Icons.person_rounded, color: T.brand700) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.name, style: T.body(weight: FontWeight.w800).copyWith(fontSize: 16)),
              Text(r.riderId == null ? 'Rider ID pending' : 'Rider ID ${r.riderId}',
                  key: const Key('rider-id'), style: T.caption(color: T.brand700)),
              if (r.companies.isNotEmpty)
                Text(r.companies.join(', '), style: T.caption(color: T.muted)),
            ]),
          ),
        ]),
        if (banner != null) ...[
          const SizedBox(height: 10),
          Alert(banner, key: const Key('onboarding-banner'), tone: tone),
        ],
      ]),
    );
  }

  Widget _payoutCard() {
    final p = _payout;
    num n(String k) => (p?[k] as num?) ?? num.tryParse('${p?[k]}') ?? 0;
    final status = '${p?["status"] ?? ""}';
    return Panel(
      key: const Key('payout-card'),
      onTap: () => widget.onOpen('payouts', const {}),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Overline("This week's payout")),
          if (p != null)
            Pill(status, tone: status.toLowerCase().contains('hold') ? Tone.bad : Tone.good, compact: true),
        ]),
        const SizedBox(height: 8),
        if (p == null)
          Text(_payoutProblem ?? 'Loading…', style: T.secondaryText())
        else ...[
          Text(money(n('finalPayout')), style: T.metric(26, color: T.navy950)),
          Text('${shortDate(p["periodFrom"])} – ${shortDate(p["periodTo"])}',
              style: T.caption(color: T.muted)),
          const SizedBox(height: 8),
          Wrap(spacing: 14, runSpacing: 4, children: [
            for (final (label, key) in const [
              ('Total', 'totalPayout'),
              ('Advance', 'advance'),
              ('Bike rent', 'bikeRental'),
              ('TDS', 'tds'),
            ])
              Text('$label ${money(n(key))}', style: T.caption()),
          ]),
        ],
      ]),
    );
  }

  Widget _tile(HomeTile t) {
    final c = toneOf(t.tone);
    final badge = t.id == 'notifications' ? widget.unread : null;
    return Panel(
      key: Key('tile-${t.id}'),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      onTap: () => _go(t),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.fill, borderRadius: BorderRadius.circular(10)),
            child: Icon(t.icon, size: 19, color: c.ink),
          ),
          const Spacer(),
          if (badge != null && badge > 0) Pill('$badge', tone: Tone.warn, compact: true),
        ]),
        const Spacer(),
        Text(t.label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: T.body(weight: FontWeight.w700).copyWith(fontSize: 13.5)),
      ]),
    );
  }
}
