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
          title: 'Home',
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
              padding: const EdgeInsets.fromLTRB(T.gutter, 6, T.gutter, 24),
              children: [
                _greeting(s),
                const SizedBox(height: 18),
                if (s.rider != null) ...[
                  _header(s.rider!),
                  const SizedBox(height: T.cardGap),
                  if (s.can('payout.payout.view')) ...[
                    _payoutCard(),
                    const SizedBox(height: T.cardGap),
                  ],
                ],
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 8, 2, 10),
                  child: Text('Quick actions', style: T.section()),
                ),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: T.cardGap,
                  crossAxisSpacing: T.cardGap,
                  childAspectRatio: 1.45,
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

  /// "Hey Raju, ready to ride?" — the first name in ink, the question in the
  /// accent. Staff get the same greeting with their own second line.
  Widget _greeting(Session s) {
    final first = (s.rider?.name ?? s.name).trim().split(' ').first;
    final tail = s.rider != null ? 'ready to ride?' : "here's your day.";
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(text: 'Hey ${first.isEmpty ? 'there' : first},\n'),
          TextSpan(text: tail, style: T.hero(color: T.accent500)),
        ]),
        key: const Key('greeting'),
        style: T.hero(),
      ),
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
          Container(
            padding: const EdgeInsets.all(2.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: T.accent500, width: 2),
            ),
            child: CircleAvatar(
              radius: 27,
              backgroundColor: T.accent100,
              backgroundImage: _photo == null ? null : MemoryImage(_photo!),
              child: _photo == null ? const Icon(Icons.person_rounded, color: T.accent700) : null,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.name, style: T.section()),
              const SizedBox(height: 2),
              Text(r.riderId == null ? 'Rider ID pending' : 'Rider ID ${r.riderId}',
                  key: const Key('rider-id'),
                  style: T.num(12.5, color: T.accent700, weight: FontWeight.w700)),
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
    final held = status.toLowerCase().contains('hold');
    // The hero card: charcoal, with the week's figure in white and the accent
    // glowing behind it — the one number a rider opens the app for.
    return Panel(
      key: const Key('payout-card'),
      fill: T.dark950,
      border: T.dark950,
      padding: EdgeInsets.zero,
      onTap: () => widget.onOpen('payouts', const {}),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(T.rCard),
        child: Stack(children: [
          Positioned(
            right: -40,
            top: -60,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [
                  T.accent500.withValues(alpha: 0.55),
                  T.accent500.withValues(alpha: 0),
                ]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Overline("This week's payout", color: T.onDarkSecondary)),
                if (p != null)
                  Pill(status,
                      compact: true,
                      solid: held
                          ? (bg: T.accent500, ink: Colors.white)
                          : (bg: T.good, ink: Colors.white)),
              ]),
              const SizedBox(height: 10),
              if (p == null)
                Text(_payoutProblem ?? 'Loading…', style: T.secondaryText(color: T.onDarkBody))
              else ...[
                Text(money(n('finalPayout')), style: T.metric(30, color: Colors.white)),
                const SizedBox(height: 2),
                Text('${shortDate(p["periodFrom"])} – ${shortDate(p["periodTo"])}',
                    style: T.caption(color: T.onDarkSecondary)),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.07),
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
                          Text(label, style: T.caption(color: T.onDarkSecondary).copyWith(fontSize: 11)),
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
                Text('See all payouts', style: T.caption(color: T.accent300)),
                const SizedBox(width: 4),
                const Icon(Icons.arrow_forward_rounded, size: 14, color: T.accent300),
              ]),
            ]),
          ),
        ]),
      ),
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
