import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Requirement indents: the list, and the one record with its decision.
///
/// The filters are the web toolbar's own query parameters — `q`, `status`,
/// `project`, `from`, `to` — so a filter means the same thing on both, and the
/// server describes in words what it applied rather than this screen guessing.
class IndentsScreen extends StatefulWidget {
  const IndentsScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onBack,
    required this.bottom,
  });

  final Api api;
  final Session session;
  final VoidCallback onBack;
  final Widget bottom;

  @override
  State<IndentsScreen> createState() => IndentsScreenState();
}

/// The statuses the web's indent toolbar offers, with the words the list uses.
const _indentStatuses = <(String, String)>[
  ('DRAFT', 'Draft'),
  ('SUBMITTED', 'Submitted'),
  ('PM_APPROVED', 'PM approved'),
  ('ADMIN_APPROVED', 'Admin approved'),
  ('REJECTED', 'Rejected'),
  ('CLOSED', 'Closed'),
  ('CANCELLED', 'Cancelled'),
];

class IndentsScreenState extends State<IndentsScreen> {
  bool _loading = true;
  String? _error;
  ListPage? _page;
  final Map<String, String> _query = {};
  bool _searching = false;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await widget.api.get('/list/material/indents', query: _query);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok) {
        _page = ListPage.from(res.data!);
      } else {
        _error = res.error;
      }
    });
  }

  void _set(String key, String? value) {
    setState(() {
      if (value == null || value.isEmpty) {
        _query.remove(key);
      } else {
        _query[key] = value;
      }
    });
    _load();
  }

  int get _applied => _query.keys.where((k) => k != 'q').length;

  @override
  Widget build(BuildContext context) {
    final rows = _page?.rows ?? const <Map<String, dynamic>>[];

    return Scaffold(
      backgroundColor: T.page,
      floatingActionButton: widget.session.can('material.indent.create')
          ? Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FloatingActionButton(
                onPressed: () => notify(context,
                    'Raising an indent needs the item picker, which is the next thing being built.'),
                backgroundColor: T.brand500,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                tooltip: 'New indent',
                child: const Icon(Icons.add_rounded, size: 26, color: Colors.white),
              ),
            )
          : null,
      body: Column(children: [
        Bar(
          title: 'Indents',
          subtitle: _loading
              ? 'Loading…'
              : '${rows.length} ${rows.length == 1 ? "indent" : "indents"} · ${widget.session.project?.code ?? "All projects"}',
          onBack: widget.onBack,
          titleStyle: _searching ? null : null,
          actions: [
            BarButton(
              icon: _searching ? Icons.close_rounded : Icons.search_rounded,
              label: _searching ? 'Close search' : 'Search',
              onTap: () {
                setState(() => _searching = !_searching);
                if (!_searching && _query.containsKey('q')) {
                  _search.clear();
                  _set('q', null);
                }
              },
            ),
            BarButton(
              icon: Icons.filter_list_rounded,
              label: 'Filter',
              dot: _applied > 0,
              onTap: _openFilters,
            ),
          ],
        ),
        if (_searching)
          Padding(
            padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 0),
            child: Field(
              fieldKey: const Key('search'),
              label: 'Search',
              controller: _search,
              hint: 'Indent no., item, project, activity…',
              onSubmit: () => _set('q', _search.text),
              suffix: IconButton(
                icon: const Icon(Icons.search_rounded, size: 20, color: T.brand700),
                onPressed: () => _set('q', _search.text),
                tooltip: 'Search',
              ),
            ),
          ),
        if (!_loading && _error == null) Band(_figures(rows)),
        if (_query.isNotEmpty)
          Chips([
            for (final e in _query.entries)
              FilterChip2(
                label: _chipLabel(e.key, e.value),
                onRemove: () => _set(e.key, null),
              ),
          ], top: 11),
        Expanded(child: RefreshIndicator(onRefresh: _load, child: _body(rows))),
        widget.bottom,
      ]),
    );
  }

  String _chipLabel(String key, String value) {
    if (key == 'status') {
      return _indentStatuses
              .where((s) => s.$1 == value)
              .map((s) => s.$2)
              .firstOrNull ??
          value;
    }
    if (key == 'q') return '“$value”';
    if (key == 'from') return 'From $value';
    if (key == 'to') return 'To $value';
    return '$key: $value';
  }

  /// The band, from the server's own summary where it gives one.
  List<Figure> _figures(List<Map<String, dynamic>> rows) {
    final awaiting = rows
        .where((r) => ['SUBMITTED', 'PM APPROVED'].contains('${r["status"]}'.toUpperCase()))
        .length;
    return [
      Figure('${rows.length}', 'Indents'),
      Figure('$awaiting', 'Awaiting', tone: awaiting > 0 ? Tone.warn : null),
      Figure(
        money(rows.fold<num>(0, (sum, r) => sum + ((r['lines'] as num?) ?? 0) * 0), short: true) ==
                '₹0'
            ? '${rows.fold<num>(0, (s, r) => s + ((r['lines'] as num?) ?? 0))}'
            : '—',
        'Lines',
      ),
    ];
  }

  Widget _body(List<Map<String, dynamic>> rows) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(padding: const EdgeInsets.all(T.gutter), children: [
        Alert(_error!),
        const SizedBox(height: 12),
        Btn('Try again', emphasis: Emphasis.outline, expand: true, onPressed: _load),
      ]);
    }
    if (rows.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 16),
        Empty('No indents match',
            detail: _page?.filters.isNotEmpty == true
                ? 'Applied: ${_page!.filters}'
                : 'Nothing has been raised yet.'),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(T.gutter, 11, T.gutter, 90),
      itemCount: rows.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: 9),
      itemBuilder: (_, i) {
        if (i == rows.length) {
          return _page!.filters.isEmpty
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(_page!.filters, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
                );
        }
        return _IndentRow(
          row: rows[i],
          nowMs: _page!.serverTime,
          api: widget.api,
          onChanged: _load,
        );
      },
    );
  }

  void _openFilters() {
    sheet<void>(
      context,
      title: 'Filter indents',
      explain: 'The same filters the web toolbar has. The server says in words what it applied.',
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Overline('Status'),
        const SizedBox(height: 8),
        Wrap(spacing: 7, runSpacing: 7, children: [
          for (final s in _indentStatuses)
            FilterChip2(
              label: s.$2,
              selected: _query['status'] == s.$1,
              onTap: () {
                Navigator.pop(ctx);
                _set('status', _query['status'] == s.$1 ? null : s.$1);
              },
            ),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: Btn('Clear all',
                emphasis: Emphasis.outline,
                height: 50,
                expand: true,
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() => _query.removeWhere((k, _) => k != 'q'));
                  _load();
                }),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Btn('Done', height: 50, expand: true, onPressed: () => Navigator.pop(ctx)),
          ),
        ]),
      ]),
    );
  }
}

/// One indent, as the design draws it: what and how much, then the status and
/// who raised it, then how far it has got.
class _IndentRow extends StatelessWidget {
  const _IndentRow({
    required this.row,
    required this.nowMs,
    required this.api,
    required this.onChanged,
  });

  final Map<String, dynamic> row;
  final int nowMs;
  final Api api;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final status = '${row["status"] ?? ""}';
    final up = status.toUpperCase();
    final tone = up.contains('REJECT') || up.contains('CANCEL')
        ? Tone.bad
        : up.contains('ADMIN APPROVED')
            ? Tone.good
            : up.contains('PM APPROVED')
                ? Tone.plum
                : up.contains('SUBMITTED')
                    ? Tone.warn
                    : Tone.draft;

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      onTap: () async {
        final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
          builder: (_) => _IndentDetail(row: row, nowMs: nowMs, api: api),
        ));
        if (changed == true) await onChanged();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${row["purpose"]?.toString().isNotEmpty == true ? row["purpose"] : row["activity"] ?? "Material request"}',
                  style: T.rowTitle().copyWith(fontSize: 15),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 3),
              Text(
                '${row["indentNo"] ?? ""}${(row["lines"] as num? ?? 0) > 1 ? " · ${row["lines"]} items" : ""}',
                style: T.num(12, color: T.muted, weight: FontWeight.w500),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ]),
          ),
          if (row['waitingDays'] != null)
            Text('${row["waitingDays"]} d', style: T.metric(14)),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Pill(status.isEmpty ? 'Draft' : status, tone: tone, compact: true),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              [row['raisedBy'], row['project']].where((v) => '$v'.isNotEmpty).join(' · '),
              style: T.num(11.5, color: T.disabledInk, weight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ]),
        const SizedBox(height: 10),
        Chain(_chainFor(up), size: 22),
      ]),
    );
  }
}

/// Raised → PM → Store → Issued, as far as it has got.
List<ChainStep> _chainFor(String status) {
  final atPm = status.contains('SUBMITTED');
  final atAdmin = status.contains('PM APPROVED');
  final done = status.contains('ADMIN APPROVED') || status.contains('CLOSED');
  return [
    const ChainStep('R', ChainState.done),
    ChainStep('PM', atPm ? ChainState.current : (atAdmin || done ? ChainState.done : ChainState.pending)),
    ChainStep('ST', atAdmin ? ChainState.current : (done ? ChainState.done : ChainState.pending)),
    ChainStep('IS', done ? ChainState.current : ChainState.pending),
  ];
}

/// One indent. Built from the list row, which carries everything the design
/// shows except the per-item lines — those need a detail endpoint, and the
/// screen says so rather than inventing them.
class _IndentDetail extends StatelessWidget {
  const _IndentDetail({required this.row, required this.nowMs, required this.api});

  final Map<String, dynamic> row;
  final int nowMs;
  final Api api;

  @override
  Widget build(BuildContext context) {
    final status = '${row["status"] ?? ""}';
    final decide = row['decide'] as Map<String, dynamic>?;
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: '${row["indentNo"] ?? "Indent"}',
          subtitle:
              '${row["project"] ?? ""} · required by ${shortDate(row["requiredBy"])}',
          onBack: () => Navigator.of(context).pop(),
          titleStyle: T.barTitle().copyWith(fontSize: 17),
          pills: [
            Pill(status, solid: (bg: T.warn, ink: T.navy950)),
            if ((row['lines'] as num? ?? 0) > 0)
              Pill('${row["lines"]} items',
                  solid: (bg: const Color(0x24FFFFFF), ink: Colors.white)),
          ],
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(T.gutter, 13, T.gutter, 20),
            children: [
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Chain(_chainFor(status.toUpperCase())),
                  const SizedBox(height: 9),
                  Text(
                    'Raised by ${row["raisedBy"] ?? "—"}, ${shortDate(row["raisedAt"])}'
                    '${row["waitingDays"] != null ? " · waiting ${row["waitingDays"]} days" : ""}',
                    style: T.caption().copyWith(fontWeight: FontWeight.w500),
                  ),
                ]),
              ),
              const SizedBox(height: 11),
              Panel(
                padding: EdgeInsets.zero,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Color(0xFFEEF1F8))),
                    ),
                    child: Overline('${row["lines"] ?? 0} items'),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      'The item lines need an endpoint of their own — the list carries '
                      'the count, not the items. That endpoint is the next thing being '
                      'built, and until it is here this screen will not pretend to know '
                      'what is on the indent.',
                      style: T.secondaryText(),
                    ),
                  ),
                ]),
              ),
              if ('${row["purpose"] ?? ""}'.isNotEmpty) ...[
                const SizedBox(height: 11),
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Overline('Purpose'),
                    const SizedBox(height: 4),
                    Text('${row["purpose"]}', style: T.body()),
                  ]),
                ),
              ],
            ],
          ),
        ),

        /*
         * Only drawn where the server said this viewer may settle it, and the
         * level comes from the server too — the screen never reads a status
         * string and decides for itself which approval it is offering.
         */
        if (decide != null)
          ActionBar(children: [
            if (decide['reject'] != null) ...[
              Expanded(
                child: Btn('Reject',
                    emphasis: Emphasis.reject,
                    height: 52,
                    expand: true,
                    onPressed: () => _settle(context, decide, reject: true)),
              ),
              const SizedBox(width: 9),
            ],
            Expanded(
              flex: 2,
              child: Btn(
                  'Approve — ${(decide["approveArgs"] as List).length > 1 ? decide["approveArgs"][1] : ""} level'
                      .replaceAll('  ', ' '),
                  emphasis: Emphasis.approve,
                  height: 52,
                  expand: true,
                  onPressed: () => _settle(context, decide, reject: false)),
            ),
          ]),
      ]),
    );
  }

  Future<void> _settle(
    BuildContext context,
    Map<String, dynamic> decide, {
    required bool reject,
  }) async {
    final action = (reject ? decide['reject'] : decide['approve']) as String;
    final args = ((reject ? decide['rejectArgs'] : decide['approveArgs']) as List?) ?? const [];
    final level = (decide['approveArgs'] as List).length > 1 ? decide['approveArgs'][1] : '';
    final reference = '${row["indentNo"] ?? "this indent"}';

    final ok = await confirmAndRun(
      context,
      api,
      Act(
        action: action,
        args: args.cast<Object?>(),
        label: reject ? 'Reject' : 'Approve',
        title: reject ? 'Reject $reference' : 'Approve at $level level',
        explain: reject
            ? 'Whoever raised it is told, and it stops here. Say why.'
            : 'Approving clears this step — the store issues what it holds and '
                'the shortfall goes to a purchase order.',
        emphasis: reject ? Emphasis.reject : Emphasis.approve,
        remark: reject ? RemarkMode.required : RemarkMode.optional,
        remarkLabel: reject ? 'Reason' : 'Remark',
        done: '$reference ${reject ? "rejected" : "approved"}.',
      ),
    );
    if (ok && context.mounted) Navigator.of(context).pop(true);
  }
}
