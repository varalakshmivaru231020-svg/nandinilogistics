import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Support / Help: Nandini Logistics' phone and email, as the server sends
/// them, with a call, a WhatsApp and an email button. Nothing here is typed
/// into the app.
class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key, required this.session});

  final Session session;

  Future<void> _go(BuildContext context, Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) notify(context, 'Nothing on this phone can open that.');
  }

  @override
  Widget build(BuildContext context) {
    final c = session.support;
    final digits = c.phone?.replaceAll(RegExp(r'[^\d+]'), '');
    final hasPhone = digits != null && digits.isNotEmpty;
    final hasEmail = c.email != null && c.email!.isNotEmpty;
    final wa = !hasPhone
        ? null
        : digits.startsWith('+')
            ? digits.substring(1)
            : (digits.length == 10 ? '91$digits' : digits);
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Support / Help', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(color: T.accent100, shape: BoxShape.circle),
                    child: const Icon(Icons.support_agent_rounded, color: T.accent700),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Nandini Logistics', style: T.section()),
                      Text('We are here to help.', style: T.caption(color: T.muted)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 16),
                if (c.isEmpty)
                  Text(
                    'Ask your tele-caller or Team Leader. The office number is not set up in the app yet.',
                    style: T.secondaryText(),
                  )
                else ...[
                  if (c.phone != null) _row(Icons.call_outlined, 'Phone', c.phone!),
                  if (hasEmail) _row(Icons.mail_outline_rounded, 'Email', c.email!),
                ],
              ]),
            ),
            const SizedBox(height: 14),
            if (hasPhone) ...[
              Btn('Call support',
                  icon: Icons.call_rounded,
                  expand: true,
                  onPressed: () => _go(context, Uri.parse('tel:$digits'))),
              const SizedBox(height: 10),
              Btn('WhatsApp',
                  icon: Icons.chat_rounded,
                  emphasis: Emphasis.outline,
                  expand: true,
                  onPressed: () => _go(context, Uri.parse('https://wa.me/$wa'))),
              const SizedBox(height: 10),
            ],
            if (hasEmail)
              Btn('Email',
                  icon: Icons.mail_rounded,
                  emphasis: Emphasis.outline,
                  expand: true,
                  onPressed: () => _go(context, Uri.parse('mailto:${c.email}'))),
            const SizedBox(height: 22),
            Panel(
              flat: true,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Common questions', style: T.body(weight: FontWeight.w700)),
                const SizedBox(height: 10),
                _faq('My payout looks wrong',
                    'Open the payout and check the breakdown from the company sheet. Then call support with your Rider ID and the week.'),
                _faq('I forgot my PIN',
                    'On the sign-in screen, enter your mobile number and tap Forgot PIN. Your tele-caller will reset it.'),
                _faq('My details changed',
                    'Profile, then Rider information, then Request a change. Admin approves it.'),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          Icon(icon, size: 18, color: T.muted),
          const SizedBox(width: 10),
          Text(label, style: T.caption(color: T.muted)),
          const Spacer(),
          Text(value, style: T.body(weight: FontWeight.w700)),
        ]),
      );

  Widget _faq(String q, String a) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(q, style: T.body(weight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(a, style: T.secondaryText()),
        ]),
      );
}
