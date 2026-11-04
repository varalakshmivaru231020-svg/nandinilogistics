import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'change_pin.dart';
import 'earnings.dart';
import 'form_screen.dart';
import 'punch.dart';
import 'support.dart';

/// The Profile tab: who you are, then the menu — attendance history, earnings,
/// payouts, notifications, support, change PIN — and sign out behind a
/// confirmation. No document upload and no ID card: riders carry neither.
class ProfileHub extends StatefulWidget {
  const ProfileHub({
    super.key,
    required this.api,
    required this.session,
    required this.bottom,
    required this.onOpen,
    required this.onNotifications,
    required this.onSignOut,
  });

  final Api api;
  final Session session;
  final Widget bottom;

  /// Opens a list in the shell — the payouts list.
  final void Function(String moduleKey, Map<String, String> query) onOpen;
  final VoidCallback onNotifications;
  final Future<void> Function() onSignOut;

  @override
  State<ProfileHub> createState() => _ProfileHubState();
}

class _ProfileHubState extends State<ProfileHub> {
  Uint8List? _photo;

  Session get _s => widget.session;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final r = _s.rider;
    if (r == null) return;
    final got = await widget.api.file(r.photoUrl ?? '/api/mobile/v1/photo');
    if (mounted && got != null) setState(() => _photo = Uint8List.fromList(got.bytes));
  }

  void _push(Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  Future<void> _confirmSignOut() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(T.rCard)),
        title: const Text('Sign out?'),
        content: const Text('You will need your mobile number and PIN to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Stay')),
          TextButton(
            key: const Key('confirm-sign-out'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out', style: TextStyle(color: T.accent700, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (yes == true) await widget.onSignOut();
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final r = s.rider;
    final name = r?.name ?? s.name;
    final canPunch = s.canAny(const ['hr.attendance.view', 'hr.attendance.punch']);
    final items = <_Item>[
      if (canPunch)
        _Item('attendance', 'Attendance History', Icons.calendar_month_outlined, T.infoTint, T.infoInk,
            () => _push(PunchScreen(api: widget.api))),
      if (r != null && s.can('payout.payout.view'))
        _Item('earnings', 'Earnings Summary', Icons.currency_rupee_rounded, T.goodTint, T.goodInk,
            () => _push(EarningsScreen(api: widget.api, session: s))),
      if (s.can('payout.payout.view'))
        _Item('payouts', 'Payouts', Icons.account_balance_wallet_outlined, T.warnTint, T.warnInk,
            () => widget.onOpen('payouts', const {})),
      _Item('notifications', 'Notifications', Icons.notifications_none_rounded, T.accent100, T.accent700,
          widget.onNotifications),
      _Item('support', 'Support / Help', Icons.support_agent_rounded, T.infoTint, T.infoInk,
          () => _push(SupportScreen(session: s))),
      if (s.can('hr.employee.changeOwnPin'))
        _Item('changePin', 'Change PIN', Icons.lock_outline_rounded, T.warnTint, T.warnInk,
            () => _push(ChangePinScreen(api: widget.api))),
      if (r != null)
        _Item('details', 'Rider Information', Icons.badge_outlined, T.plumTint, T.plumInk,
            () => _push(ProfileScreen(
                  session: s,
                  onRequestChange: s.can('hr.employee.requestEdit')
                      ? () => Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => FormScreen(api: widget.api, formKey: 'hr/profile:edit', recordId: r.id)))
                      : null,
                ))),
    ];

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Expanded(
          child: ListView(padding: EdgeInsets.zero, children: [
            _header(name, r),
            Padding(
              padding: const EdgeInsets.fromLTRB(T.gutter, 18, T.gutter, 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Panel(
                  padding: EdgeInsets.zero,
                  child: Column(children: [
                    for (var i = 0; i < items.length; i++) ...[
                      if (i > 0) const Divider(height: 1, thickness: 1, color: T.line, indent: 64),
                      _menuRow(items[i]),
                    ],
                  ]),
                ),
                const SizedBox(height: 16),
                Btn('Logout',
                    key: const Key('sign-out'),
                    icon: Icons.logout_rounded,
                    emphasis: Emphasis.reject,
                    expand: true,
                    height: 52,
                    onPressed: _confirmSignOut),
                const SizedBox(height: 10),
                Text(s.email, textAlign: TextAlign.center, style: T.caption(color: T.muted)),
              ]),
            ),
          ]),
        ),
        widget.bottom,
      ]),
    );
  }

  /// A red curved header with the photo and the name on it.
  Widget _header(String name, RiderProfile? r) {
    final top = MediaQuery.of(context).padding.top;
    return Stack(children: [
      ClipPath(
        clipper: _Wave(),
        child: Container(
          height: top + 190,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [T.accent500, T.accent700],
            ),
          ),
        ),
      ),
      Padding(
        padding: EdgeInsets.fromLTRB(T.gutter, top + 12, T.gutter, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Profile', style: T.screenTitle(color: Colors.white)),
          const SizedBox(height: 22),
          Row(children: [
            Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: T.soft),
              child: CircleAvatar(
                radius: 40,
                backgroundColor: T.accent100,
                backgroundImage: _photo == null ? null : MemoryImage(_photo!),
                child: _photo == null ? const Icon(Icons.person_rounded, size: 38, color: T.accent700) : null,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: T.section(color: T.ink).copyWith(fontSize: 19), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                if (r != null)
                  Text(r.riderId == null ? 'Rider ID pending' : 'Rider ID: ${r.riderId}',
                      style: T.num(13, color: T.secondary, weight: FontWeight.w600))
                else
                  Text(_s.roleNames.isEmpty ? 'Staff' : _s.roleNames.first, style: T.secondaryText()),
                const SizedBox(height: 8),
                Row(children: [
                  if (r != null)
                    Pill(r.isActive ? 'Active' : 'Inactive',
                        compact: true,
                        solid: r.isActive ? (bg: T.goodTint, ink: T.goodInk) : (bg: T.badTint, ink: T.badInk)),
                  if (r?.location != null) ...[
                    const SizedBox(width: 8),
                    const Icon(Icons.location_on_outlined, size: 14, color: T.muted),
                    const SizedBox(width: 2),
                    Flexible(
                      child: Text(r!.location!, style: T.caption(color: T.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ]),
              ]),
            ),
          ]),
        ]),
      ),
    ]);
  }

  Widget _menuRow(_Item it) => InkWell(
        key: Key('profile-${it.id}'),
        onTap: it.onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
          child: Row(children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: it.fill, borderRadius: BorderRadius.circular(11)),
              child: Icon(it.icon, size: 20, color: it.ink),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(it.label, style: T.body(weight: FontWeight.w600))),
            const Icon(Icons.chevron_right_rounded, color: T.chevron),
          ]),
        ),
      );
}

class _Item {
  const _Item(this.id, this.label, this.icon, this.fill, this.ink, this.onTap);
  final String id;
  final String label;
  final IconData icon;
  final Color fill;
  final Color ink;
  final VoidCallback onTap;
}

/// The header's lower edge: a gentle wave, the way the design draws it.
class _Wave extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final p = Path()..lineTo(0, size.height - 70);
    p.quadraticBezierTo(size.width * 0.25, size.height - 20, size.width * 0.55, size.height - 48);
    p.quadraticBezierTo(size.width * 0.8, size.height - 72, size.width, size.height - 40);
    p.lineTo(size.width, 0);
    p.close();
    return p;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> old) => false;
}

/// The rider's own particulars, read-only. A change is a request Admin
/// approves, through the server's `hr/profile:edit` form.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.session, this.onRequestChange});

  final Session session;

  /// Null where this account may not ask for a change.
  final VoidCallback? onRequestChange;

  @override
  Widget build(BuildContext context) {
    final r = session.rider;
    Widget line(String label, String? value) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 130, child: Text(label, style: T.caption(color: T.muted))),
            Expanded(
              child: Text(value == null || value.isEmpty ? '—' : value,
                  style: T.body(weight: FontWeight.w600)),
            ),
          ]),
        );
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Rider information', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Panel(
              child: Column(children: [
                line('Name', r?.name ?? session.name),
                line('Rider ID', r?.riderId),
                line('Mobile', r?.mobile),
                line('Location', r?.location),
                line('Client companies', r?.companies.join(', ')),
                line('Joined', r?.joinedOn == null ? null : shortDate(r!.joinedOn)),
                line('Insurance no.', r?.insuranceNumber),
                line('Emergency (family)', r?.emergencyMobileFamily),
                line('Referral ID', r?.referralCode),
              ]),
            ),
            if (onRequestChange != null) ...[
              const SizedBox(height: 14),
              Btn('Request a change',
                  key: const Key('request-change'),
                  icon: Icons.edit_note_rounded,
                  emphasis: Emphasis.outline,
                  expand: true,
                  onPressed: onRequestChange),
              const SizedBox(height: 6),
              Text('Admin reviews the change before it is saved.',
                  textAlign: TextAlign.center, style: T.caption(color: T.muted)),
            ],
          ]),
        ),
      ]),
    );
  }
}
