import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'record_screen.dart';

/// Incentives: what the companies' payout sheets have paid in incentive
/// columns. The total comes with the session; each payout's own incentive
/// lines are in its record, under "From the … sheet". There are no targets or
/// rules in the system to show — the company decides those on its sheet.
class IncentivesScreen extends StatefulWidget {
  const IncentivesScreen({super.key, required this.api, required this.session});

  final Api api;
  final Session session;

  @override
  State<IncentivesScreen> createState() => _IncentivesScreenState();
}

class _IncentivesScreenState extends State<IncentivesScreen> {
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await widget.api.get('/list/payouts', query: const {'page': '1', 'pageSize': '30'});
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok) _rows = ListPage.from(res.data!).rows;
    });
  }

  @override
  Widget build(BuildContext context) {
    final earned = widget.session.rider?.incentives;
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Incentives', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Container(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(T.rCard),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFF0A23A), Color(0xFFD97B1E)],
                ),
                boxShadow: T.soft,
              ),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('INCENTIVES EARNED', style: T.overline(color: Colors.white.withValues(alpha: 0.85))),
                    const SizedBox(height: 8),
                    Text(earned == null ? '—' : money(earned),
                        key: const Key('incentives-total'), style: T.metric(32, color: Colors.white)),
                    const SizedBox(height: 4),
                    Text(
                      earned == null
                          ? 'None in your company sheets yet'
                          : 'Across every posted payout',
                      style: T.caption(color: Colors.white.withValues(alpha: 0.9)),
                    ),
                  ]),
                ),
                const Icon(Icons.emoji_events_rounded, size: 56, color: Colors.white54),
              ]),
            ),
            const SizedBox(height: 14),
            Panel(
              flat: true,
              child: Text(
                'Incentives are paid by the company you deliver for and come in with your weekly payout sheet. '
                'Open a payout below to see its incentive lines under the company sheet breakdown.',
                style: T.secondaryText(),
              ),
            ),
            const SizedBox(height: 18),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
              child: Text('Payouts with breakdown', style: T.section()),
            ),
            if (_loading)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (_rows.isEmpty)
              const Empty('No payout posted yet')
            else
              for (final r in _rows) ...[
                Panel(
                  padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => RecordScreen(
                          api: widget.api, module: 'payouts', id: '${r["id"]}', fallbackTitle: 'Payout'))),
                  child: Row(children: [
                    const Icon(Icons.receipt_long_outlined, color: T.warnInk),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text('${shortDate(r["periodFrom"])} – ${shortDate(r["periodTo"])}',
                          style: T.rowTitle()),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: T.chevron),
                  ]),
                ),
                const SizedBox(height: 8),
              ],
          ]),
        ),
      ]),
    );
  }
}
