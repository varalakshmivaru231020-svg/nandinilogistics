import 'package:flutter/material.dart';

import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

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
        Bar(title: 'My profile', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Panel(
              child: Column(children: [
                line('Name', r?.name ?? session.name),
                line('Rider ID', r?.riderId),
                line('Mobile', r?.mobile),
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
