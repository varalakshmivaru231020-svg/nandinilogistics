import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/session.dart';
import '../core/share.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Refer a friend: the rider's own referral ID, a way to send it, and the
/// riders who joined with it (SOW §3.6 — counted once they stay 25 days).
class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key, required this.api, required this.session});

  final Api api;
  final Session session;

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  List<Map<String, dynamic>> _rows = const [];
  String? _error;
  bool _loading = true;

  String? get _code => widget.session.rider?.referralCode ?? widget.session.rider?.riderId;

  @override
  void initState() {
    super.initState();
    if (widget.session.can('hr.referral.view')) {
      _load();
    } else {
      _loading = false;
    }
  }

  Future<void> _load() async {
    final res = await widget.api.get('/list/hr/referrals');
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (!res.ok) {
        _error = res.missing ? notOnServer : res.error;
        return;
      }
      _rows = ListPage.from(res.data!).rows;
    });
  }

  Future<void> _share() async {
    final code = _code!;
    final problem = await Sharer.live.text(
      'Join Nandini Logistics as a delivery rider. Use my referral ID $code '
      'when you sign up in the Nandini Rider app.',
      subject: 'Ride with Nandini Logistics',
    );
    if (problem != null && mounted) notify(context, problem);
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: _code!));
    if (mounted) notify(context, 'Referral ID copied.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Refer a friend', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Overline('Your referral ID'),
                const SizedBox(height: 6),
                Text(_code ?? 'Given once your onboarding is accepted',
                    key: const Key('referral-code'),
                    style: _code == null ? T.secondaryText() : T.metric(26, color: T.brand700)),
                const SizedBox(height: 6),
                Text('A friend who signs up with it and stays 25 days counts as your referral.',
                    style: T.caption(color: T.muted)),
                if (_code != null) ...[
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      child: Btn('Share',
                          key: const Key('share-referral'),
                          icon: Icons.share_rounded,
                          onPressed: _share),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Btn('Copy',
                          key: const Key('copy-referral'),
                          icon: Icons.copy_rounded,
                          emphasis: Emphasis.outline,
                          onPressed: _copy),
                    ),
                  ]),
                ],
              ]),
            ),
            const SizedBox(height: 18),
            if (widget.session.can('hr.referral.view')) ...[
              const Overline('Your referrals'),
              const SizedBox(height: 8),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Alert(_error!, tone: Tone.warn)
              else if (_rows.isEmpty)
                const Empty('No referrals yet', detail: 'Share your ID to get started.')
              else
                for (final r in _rows) ...[
                  Panel(
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r["referred"] ?? "—"}', style: T.body(weight: FontWeight.w700)),
                          Text(
                              'Joined ${shortDate(r["joinedOn"])} · '
                              'counts from ${shortDate(r["validUntil"])}',
                              style: T.caption(color: T.muted)),
                        ]),
                      ),
                      Pill('${r["status"] ?? ""}',
                          tone: '${r["eligible"]}'.toLowerCase().startsWith('y')
                              ? Tone.good
                              : Tone.draft,
                          compact: true),
                    ]),
                  ),
                  const SizedBox(height: 8),
                ],
            ],
          ]),
        ),
      ]),
    );
  }
}
