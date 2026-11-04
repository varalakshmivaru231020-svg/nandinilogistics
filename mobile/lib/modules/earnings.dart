import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'record_screen.dart';

/// My Earnings: what the posted payouts add up to — the latest week, this
/// month, everything on record — and the incentives inside them, then every
/// payout line. All of it is the payout list the web shows, summed on the
/// phone; nothing is estimated.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key, required this.api, required this.session});

  final Api api;
  final Session session;

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

num _n(Map<String, dynamic> p, String k) => (p[k] as num?) ?? num.tryParse('${p[k]}') ?? 0;

class _EarningsScreenState extends State<EarningsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await widget.api.get('/list/payouts', query: const {'page': '1', 'pageSize': '60'});
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (!res.ok) {
        _error = res.missing ? notOnServer : res.error;
      } else {
        _rows = ListPage.from(res.data!).rows;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final thisMonth = _rows.where((r) {
      final to = DateTime.tryParse('${r["periodTo"]}');
      return to != null && to.year == now.year && to.month == now.month;
    });
    final latest = _rows.isEmpty ? null : _rows.first;
    final month = thisMonth.fold<num>(0, (s, r) => s + _n(r, 'finalPayout'));
    final total = _rows.fold<num>(0, (s, r) => s + _n(r, 'finalPayout'));
    final deductions = _rows.fold<num>(0, (s, r) => s + _n(r, 'advance') + _n(r, 'bikeRental') + _n(r, 'tds'));
    final incentives = widget.session.rider?.incentives;

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'My Earnings',
          subtitle: 'From posted payouts',
          onBack: () => Navigator.maybePop(context),
          actions: [BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load)],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Padding(padding: const EdgeInsets.all(T.gutter), child: Alert(_error!, tone: Tone.warn))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 28),
                        children: [
                          _hero(latest),
                          const SizedBox(height: T.cardGap),
                          Row(children: [
                            Expanded(child: _stat('This month', money(month), T.goodTint, T.goodInk)),
                            const SizedBox(width: T.cardGap),
                            Expanded(child: _stat('All time', money(total), T.infoTint, T.infoInk)),
                          ]),
                          const SizedBox(height: T.cardGap),
                          Row(children: [
                            Expanded(
                              child: _stat(
                                'Incentives',
                                incentives == null ? '—' : money(incentives),
                                T.warnTint,
                                T.warnInk,
                                note: incentives == null ? 'None in your company sheets' : null,
                              ),
                            ),
                            const SizedBox(width: T.cardGap),
                            Expanded(child: _stat('Deductions', money(deductions), T.plumTint, T.plumInk,
                                note: 'Advance · bike rent · TDS')),
                          ]),
                          const SizedBox(height: 22),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
                            child: Row(children: [
                              Text('Earnings history', style: T.section()),
                              const Spacer(),
                              Text('${_rows.length} payouts', style: T.caption(color: T.muted)),
                            ]),
                          ),
                          if (_rows.isEmpty)
                            const Empty('No payout posted yet',
                                detail: 'Your first payout appears here once the company sheet is posted.')
                          else
                            for (final r in _rows) ...[_row(r), const SizedBox(height: 8)],
                        ],
                      ),
                    ),
        ),
      ]),
    );
  }

  Widget _hero(Map<String, dynamic>? p) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(T.rCard),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [T.accent500, T.accent700],
        ),
        boxShadow: T.glow,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text("LATEST WEEK'S EARNINGS",
            style: T.overline(color: Colors.white.withValues(alpha: 0.8))),
        const SizedBox(height: 8),
        Text(p == null ? '—' : money(_n(p, 'finalPayout')), style: T.metric(34, color: Colors.white)),
        const SizedBox(height: 4),
        Text(
          p == null ? 'No payout posted yet' : '${shortDate(p["periodFrom"])} – ${shortDate(p["periodTo"])}',
          style: T.caption(color: Colors.white.withValues(alpha: 0.85)),
        ),
      ]),
    );
  }

  Widget _stat(String label, String value, Color fill, Color ink, {String? note}) => Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(T.rCard)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: T.caption(color: ink)),
          const SizedBox(height: 4),
          Text(value, style: T.metric(20, color: ink), maxLines: 1, overflow: TextOverflow.ellipsis),
          if (note != null) ...[
            const SizedBox(height: 2),
            Text(note, style: T.caption(color: ink).copyWith(fontSize: 10.5), maxLines: 2),
          ],
        ]),
      );

  Widget _row(Map<String, dynamic> r) {
    final status = '${r["status"] ?? ""}';
    final held = status.toLowerCase().contains('hold');
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => RecordScreen(api: widget.api, module: 'payouts', id: '${r["id"]}', fallbackTitle: 'Payout'))),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: held ? T.warnTint : T.goodTint, shape: BoxShape.circle),
          child: Icon(held ? Icons.pause_circle_outline_rounded : Icons.check_circle_outline_rounded,
              size: 20, color: held ? T.warnInk : T.goodInk),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${shortDate(r["periodFrom"])} – ${shortDate(r["periodTo"])}', style: T.rowTitle()),
            const SizedBox(height: 2),
            Text('Total ${money(_n(r, "totalPayout"), short: true)} · deductions ${money(_n(r, "advance") + _n(r, "bikeRental") + _n(r, "tds"), short: true)}',
                style: T.caption(color: T.muted)),
          ]),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(money(_n(r, 'finalPayout')), style: T.num(14, weight: FontWeight.w800)),
          if (status.isNotEmpty) Pill(status, compact: true, tone: held ? Tone.warn : Tone.good),
        ]),
        const SizedBox(width: 4),
        const Icon(Icons.chevron_right_rounded, color: T.chevron),
      ]),
    );
  }
}
