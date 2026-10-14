import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Everything waiting on a decision, oldest first — and decided from here.
///
/// The queue is deliberately wider than what this person may settle: seeing an
/// indent waiting on the Owner tells a store manager it is moving. So a row
/// either carries its two buttons or it does not, and the ones it cannot settle
/// say where they are settled instead.
class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onBack,
    required this.bottom,
    this.onCount,
  });

  final Api api;
  final Session session;
  final VoidCallback onBack;
  final Widget bottom;

  /// Tells the shell how many are waiting, for the badge.
  final void Function(int)? onCount;

  @override
  State<ApprovalsScreen> createState() => ApprovalsScreenState();
}

class ApprovalsScreenState extends State<ApprovalsScreen> {
  bool _loading = true;
  String? _error;
  ListPage? _page;
  String _kind = '';

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
    final res = await widget.api.get('/list/approvals');
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final page = ListPage.from(res.data!);
    setState(() {
      _loading = false;
      _page = page;
    });
    widget.onCount?.call(page.rows.length);
  }

  List<Map<String, dynamic>> get _rows {
    final all = _page?.rows ?? const <Map<String, dynamic>>[];
    if (_kind.isEmpty) return all;
    return all.where((r) => '${r["kind"]}' == _kind).toList();
  }

  Map<String, int> get _counts {
    final out = <String, int>{};
    for (final r in _page?.rows ?? const <Map<String, dynamic>>[]) {
      final k = '${r["kind"]}';
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final total = _page?.rows.length ?? 0;
    final counts = _counts;
    final kinds = counts.keys.toList()..sort();

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Approvals',
          subtitle: _loading ? 'Loading…' : '$total waiting · oldest first',
          onBack: widget.onBack,
          actions: [
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load),
          ],
        ),
        if (!_loading && _error == null && total > 0)
          Chips([
            FilterChip2(
              label: 'All',
              count: total,
              selected: _kind.isEmpty,
              onTap: () => setState(() => _kind = ''),
            ),
            for (final k in kinds)
              FilterChip2(
                label: k,
                count: counts[k],
                selected: _kind == k,
                onTap: () => setState(() => _kind = _kind == k ? '' : k),
              ),
          ]),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _body(),
          ),
        ),
        widget.bottom,
      ]),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return ListView(padding: const EdgeInsets.all(T.gutter), children: [
        Alert(_error!),
        const SizedBox(height: 12),
        Btn('Try again', emphasis: Emphasis.outline, expand: true, onPressed: _load),
      ]);
    }

    final rows = _rows;
    if (rows.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 20),
        Empty(
          _kind.isEmpty ? 'Nothing is waiting on you' : 'Nothing of that kind is waiting',
          detail: _kind.isEmpty
              ? 'Approvals you can settle appear here, oldest first.'
              : 'Clear the filter to see the other ${(_page?.rows.length ?? 0) - rows.length}.',
        ),
      ]);
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 20),
      itemCount: rows.length,
      separatorBuilder: (_, __) => const SizedBox(height: 9),
      itemBuilder: (_, i) => _Row(
        row: rows[i],
        nowMs: _page!.serverTime,
        onDecided: _load,
        api: widget.api,
      ),
    );
  }
}

/// The tone a kind of decision carries, so a glance separates money from work.
Tone _toneFor(String kind) {
  final k = kind.toLowerCase();
  if (k.contains('indent')) return Tone.warn;
  if (k.contains('invoice') || k.contains('return')) return Tone.bad;
  if (k.contains('checklist') || k.contains('review') || k.contains('approval')) return Tone.plum;
  if (k.contains('closure') || k.contains('extension')) return Tone.info;
  return Tone.draft;
}

class _Row extends StatelessWidget {
  const _Row({
    required this.row,
    required this.nowMs,
    required this.onDecided,
    required this.api,
  });

  final Map<String, dynamic> row;
  final int nowMs;
  final Future<void> Function() onDecided;
  final Api api;

  @override
  Widget build(BuildContext context) {
    final kind = '${row["kind"] ?? ""}';
    final tone = _toneFor(kind);
    final decide = row['decide'] as Map<String, dynamic>?;
    final mine = row['canDecide'] == true;
    final waiting = '${row["waiting"] ?? ""}';
    // Anything that has been sitting for a month reads as late, not merely old.
    final late = RegExp(r'^(\d+)').firstMatch(waiting) != null &&
        int.parse(RegExp(r'^(\d+)').firstMatch(waiting)!.group(1)!) >= 7;

    final canDecideHere = mine && decide != null;

    return Panel(
      // A card that wants something from you is bordered; the rest are plain.
      border: canDecideHere ? T.warnLineStrong : (decide == null ? T.plumLine : T.line),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      onTap: canDecideHere ? null : () => _openElsewhere(context),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          KindTag(kind, tone: tone),
          const SizedBox(width: 7),
          Text('waiting $waiting',
              style: T.caption(color: late ? T.badInk : T.muted)
                  .copyWith(fontWeight: late ? FontWeight.w700 : FontWeight.w600)),
        ]),
        const SizedBox(height: 7),
        Text('${row["reference"] ?? ""}',
            style: T.num(15, weight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 3),
        Text(
          [row['title'], row['raisedBy'], row['project']]
              .where((v) => v != null && '$v'.isNotEmpty)
              .join(' · '),
          style: T.secondaryText(color: T.muted).copyWith(fontSize: 12.5),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 7),
        Row(children: [
          if (row['value'] != null)
            Text(money(row['value'] as num?), style: T.metric(16))
          else
            const SizedBox.shrink(),
          const Spacer(),
          Text('${row["waitingOn"] ?? ""}',
              style: T.caption(color: tone == Tone.plum ? T.plumInk : T.muted)
                  .copyWith(fontWeight: FontWeight.w700, fontSize: 11.5)),
        ]),

        if (canDecideHere)
          Padding(
            padding: const EdgeInsets.only(top: 11),
            child: Row(children: [
              // Only drawn where the step actually has a refusal — a purchase
              // order is cancelled, not rejected, and a closure is sent back.
              if (decide['reject'] != null) ...[
                Expanded(
                  child: Btn('Reject',
                      emphasis: Emphasis.reject,
                      height: 44,
                      expand: true,
                      onPressed: () => _decide(context, reject: true)),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                flex: decide['reject'] != null ? 3 : 2,
                child: Btn('Approve',
                    emphasis: Emphasis.approve,
                    height: 44,
                    expand: true,
                    onPressed: () => _decide(context, reject: false)),
              ),
            ]),
          )
        else
          Padding(
            padding: const EdgeInsets.only(top: 9),
            child: Row(children: [
              Expanded(
                child: Text(
                  decide == null
                      ? 'Settled on its own screen, point by point'
                      : 'Waiting on someone else',
                  style: T.caption(color: decide == null ? T.plumInk : T.muted)
                      .copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (decide == null)
                Text('Open →', style: T.body(color: T.brand700, weight: FontWeight.w700)
                    .copyWith(fontSize: 13)),
            ]),
          ),
      ]),
    );
  }

  void _openElsewhere(BuildContext context) {
    // The screen this is settled on is not built yet. Saying so is better than
    // a tap that appears to do nothing.
    notify(context, 'This one is settled on the ${_where()} screen, which is not on the phone yet.');
  }

  String _where() {
    final k = '${row["kind"]}'.toLowerCase();
    if (k.contains('checklist') || k.contains('review') || k.contains('approval')) return 'task';
    if (k.contains('extension')) return 'schedule';
    return 'record';
  }

  Future<void> _decide(BuildContext context, {required bool reject}) async {
    final decide = row['decide'] as Map<String, dynamic>;
    final action = (reject ? decide['reject'] : decide['approve']) as String;
    final args = ((reject ? decide['rejectArgs'] : decide['approveArgs']) as List?) ?? const [];
    final required = decide['remarkRequired'] == true;
    final reference = '${row["reference"] ?? "it"}';
    final value = row['value'] as num?;

    final ok = await confirmAndRun(
      context,
      api,
      Act(
        action: action,
        args: args.cast<Object?>(),
        label: reject ? 'Reject' : 'Approve',
        title: reject ? 'Reject $reference' : 'Approve $reference',
        explain: reject
            ? 'Whoever raised it is told, and it stops here. Say why.'
            : 'This clears the step it is waiting at — ${row["waitingOn"]}.'
                '${value != null ? " It is worth ${money(value)}." : ""}',
        emphasis: reject ? Emphasis.reject : Emphasis.approve,
        // A refusal always says why. An approval may.
        remark: reject || required ? RemarkMode.required : RemarkMode.optional,
        remarkLabel: reject ? 'Reason' : 'Remark',
        done: '$reference ${reject ? "rejected" : "approved"}.',
      ),
    );
    if (ok) await onDecided();
  }
}
