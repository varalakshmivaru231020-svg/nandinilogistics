import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'spec.dart';

/// A module's list, drawn to the pattern the canvas sets for one.
///
/// The canvas draws this list once — on Indents — and reuses it, with the band,
/// the chips, the row and the actions changing per module. So the pattern is
/// here and the specifics are in `spec.dart`, written out module by module to
/// match the web panel's own filters and figures.
class ModuleScreen extends StatefulWidget {
  const ModuleScreen({
    super.key,
    required this.api,
    required this.session,
    required this.spec,
    required this.onBack,
    required this.bottom,
    required this.onPickProject,
  });

  final Api api;
  final Session session;
  final ModuleSpec spec;
  final VoidCallback onBack;
  final Widget bottom;

  /// Opens the workspace chooser, for a module that needs one.
  final VoidCallback onPickProject;

  @override
  State<ModuleScreen> createState() => ModuleScreenState();
}

class ModuleScreenState extends State<ModuleScreen> {
  bool _loading = true;
  String? _error;

  /// The server asked for a project before it will answer. A schedule belongs
  /// to one project, so this is a prompt rather than a failure.
  bool _needsProject = false;
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
  void didUpdateWidget(ModuleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.spec.key != widget.spec.key) {
      _query.clear();
      _search.clear();
      _searching = false;
      _load();
    }
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
    final res = await widget.api.get('/list/${widget.spec.key}', query: _query);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _needsProject = res.code == 'project-required';
      if (res.ok) {
        _page = ListPage.from(res.data!);
      } else {
        _error = _needsProject ? null : res.error;
        _page = null;
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
    final spec = widget.spec;
    final rows = _page?.rows ?? const <Map<String, dynamic>>[];
    final now = _page?.serverTime ?? DateTime.now().millisecondsSinceEpoch;

    return Scaffold(
      backgroundColor: T.page,
      floatingActionButton: spec.createLabel == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FloatingActionButton(
                onPressed: () => notify(context,
                    '${spec.createLabel} needs its form, which is built per module after the lists.'),
                backgroundColor: T.brand500,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                tooltip: spec.createLabel,
                child: const Icon(Icons.add_rounded, size: 26, color: Colors.white),
              ),
            ),
      body: Column(children: [
        Bar(
          title: spec.title,
          subtitle: _loading
              ? 'Loading…'
              : '${rows.length} ${rows.length == 1 ? "record" : "records"} · '
                  '${widget.session.project?.code ?? "All projects"}',
          onBack: widget.onBack,
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
            if (spec.filters.isNotEmpty)
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
              hint: spec.searchHint,
              onSubmit: () => _set('q', _search.text),
              suffix: IconButton(
                tooltip: 'Search',
                icon: const Icon(Icons.search_rounded, size: 20, color: T.brand700),
                onPressed: () => _set('q', _search.text),
              ),
            ),
          ),
        if (!_loading && _error == null && spec.figures != null)
          Band(spec.figures!(rows, now)),
        if (_query.isNotEmpty)
          Chips([
            for (final e in _query.entries)
              FilterChip2(label: _chipLabel(e.key, e.value), onRemove: () => _set(e.key, null)),
          ], top: 11),
        Expanded(child: RefreshIndicator(onRefresh: _load, child: _body(rows, now))),
        widget.bottom,
      ]),
    );
  }

  String _chipLabel(String key, String value) {
    if (key == 'q') return '“$value”';
    final f = widget.spec.filters.where((f) => f.key == key).firstOrNull;
    if (f == null) return '$key: $value';
    final option = f.options.where((o) => o.$1 == value).firstOrNull;
    return option == null ? '${f.label}: $value' : option.$2;
  }

  Widget _body(List<Map<String, dynamic>> rows, int now) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_needsProject) {
      return ListView(padding: const EdgeInsets.all(T.gutter), children: [
        const Alert(
          'Choose a project first — a schedule belongs to one project, not to all '
          'of them at once.',
          tone: Tone.info,
        ),
        const SizedBox(height: 12),
        Btn('Choose a project',
            icon: Icons.home_work_outlined,
            emphasis: Emphasis.outline,
            expand: true,
            onPressed: widget.onPickProject),
      ]);
    }

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
        Empty('No ${widget.spec.title.toLowerCase()} match',
            detail: _page!.filters.isNotEmpty ? 'Applied: ${_page!.filters}' : null),
      ]);
    }

    return ListView.separated(
      padding: EdgeInsets.fromLTRB(
          T.gutter, 11, T.gutter, widget.spec.createLabel == null ? 20 : 90),
      itemCount: rows.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: 9),
      itemBuilder: (_, i) {
        if (i == rows.length) {
          return _page!.filters.isEmpty
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(_page!.filters,
                      style: T.caption().copyWith(fontWeight: FontWeight.w500)),
                );
        }
        return SpecRow(
          spec: widget.spec,
          row: rows[i],
          nowMs: now,
          api: widget.api,
          onChanged: _load,
        );
      },
    );
  }

  void _openFilters() {
    sheet<void>(
      context,
      title: 'Filter ${widget.spec.title.toLowerCase()}',
      explain: 'The same filters the web toolbar has. The server says in words '
          'what it applied, and that line is at the foot of the list.',
      body: (ctx) => _FilterSheet(
        spec: widget.spec,
        query: Map.of(_query),
        onApply: (q) {
          Navigator.pop(ctx);
          setState(() {
            _query
              ..removeWhere((k, _) => k != 'q')
              ..addAll(q);
          });
          _load();
        },
        onClear: () {
          Navigator.pop(ctx);
          setState(() => _query.removeWhere((k, _) => k != 'q'));
          _load();
        },
      ),
    );
  }
}

/// One record, as its module's spec reads it.
class SpecRow extends StatelessWidget {
  const SpecRow({
    super.key,
    required this.spec,
    required this.row,
    required this.nowMs,
    required this.api,
    required this.onChanged,
  });

  final ModuleSpec spec;
  final Map<String, dynamic> row;
  final int nowMs;
  final Api api;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final status = spec.row.status?.call(row) ?? '';
    final trailing = spec.row.trailing?.call(row) ?? '';
    final meta = spec.row.meta?.call(row, nowMs) ?? '';
    final decide = row['decide'] as Map<String, dynamic>?;

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      border: decide != null ? T.warnLineStrong : T.line,
      onTap: () async {
        final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
          builder: (_) => SpecDetail(spec: spec, row: row, api: api),
        ));
        if (changed == true) await onChanged();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(spec.row.title(row),
                  style: T.rowTitle().copyWith(fontSize: 15),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 3),
              Text(spec.row.subtitle(row),
                  style: T.num(12, color: T.muted, weight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ]),
          ),
          if (trailing.isNotEmpty) ...[
            const SizedBox(width: 10),
            Text(trailing, style: T.metric(14)),
          ],
        ]),
        if (status.isNotEmpty || meta.isNotEmpty) ...[
          const SizedBox(height: 10),
          Row(children: [
            if (status.isNotEmpty) ...[
              Pill(status, tone: spec.row.statusTone?.call(row) ?? Tone.draft, compact: true),
              const SizedBox(width: 7),
            ],
            if (meta.isNotEmpty)
              Expanded(
                child: Text(meta,
                    style: T.num(11.5, color: T.disabledInk, weight: FontWeight.w500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
          ]),
        ],
        if (spec.chain != null) ...[
          const SizedBox(height: 10),
          Chain(spec.chain!(row), size: 22),
        ],
      ]),
    );
  }
}

/// One record in full, with whatever can be done to it at the foot.
class SpecDetail extends StatelessWidget {
  const SpecDetail({
    super.key,
    required this.spec,
    required this.row,
    required this.api,
  });

  final ModuleSpec spec;
  final Map<String, dynamic> row;
  final Api api;

  @override
  Widget build(BuildContext context) {
    final decide = row['decide'] as Map<String, dynamic>?;
    final status = spec.row.status?.call(row) ?? '';
    final wide = spec.detail.where((f) => f.wide).toList();
    final narrow = spec.detail.where((f) => !f.wide).toList();

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: spec.row.title(row),
          subtitle: spec.row.subtitle(row),
          onBack: () => Navigator.of(context).pop(),
          titleStyle: T.barTitle().copyWith(fontSize: 17),
          pills: [
            if (status.isNotEmpty) Pill(status, solid: (bg: T.warn, ink: T.navy950)),
          ],
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(T.gutter, 13, T.gutter, 20),
            children: [
              if (spec.chain != null) ...[
                Panel(child: Chain(spec.chain!(row))),
                const SizedBox(height: 11),
              ],
              Panel(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (final f in narrow) _line(f),
                ]),
              ),
              for (final f in wide)
                if (_value(f).isNotEmpty) ...[
                  const SizedBox(height: 11),
                  Panel(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Overline(f.label),
                      const SizedBox(height: 5),
                      Text(_value(f), style: T.body()),
                    ]),
                  ),
                ],
            ],
          ),
        ),
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
              child: Btn('Approve',
                  emphasis: Emphasis.approve,
                  height: 52,
                  expand: true,
                  onPressed: () => _settle(context, decide, reject: false)),
            ),
          ]),
      ]),
    );
  }

  String _value(DetailField f) {
    final v = f.read(row);
    if (v == null || '$v'.isEmpty) return '';
    if (f.money) return money(v as num?);
    if (v is bool) return v ? 'Yes' : 'No';
    final s = '$v';
    // An ISO date reads as a date, not as a timestamp.
    if (RegExp(r'^\d{4}-\d{2}-\d{2}T').hasMatch(s)) return shortDate(s);
    return s.replaceAll('_', ' ');
  }

  Widget _line(DetailField f) {
    final v = _value(f);
    if (v.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 118,
          child: Text(f.label, style: T.caption()),
        ),
        Expanded(
          child: Text(v,
              style: f.money || RegExp(r'^[\d,.₹ /-]+$').hasMatch(v)
                  ? T.num(14, weight: FontWeight.w600)
                  : T.body(weight: FontWeight.w600)),
        ),
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
    final required = decide['remarkRequired'] == true;
    final name = spec.row.subtitle(row);

    final ok = await confirmAndRun(
      context,
      api,
      Act(
        action: action,
        args: args.cast<Object?>(),
        label: reject ? 'Reject' : 'Approve',
        title: reject ? 'Reject $name' : 'Approve $name',
        explain: reject
            ? 'Whoever raised it is told, and it stops here. Say why.'
            : 'This clears the step it is waiting at.',
        emphasis: reject ? Emphasis.reject : Emphasis.approve,
        remark: reject || required ? RemarkMode.required : RemarkMode.optional,
        remarkLabel: reject ? 'Reason' : 'Remark',
        done: '$name ${reject ? "rejected" : "approved"}.',
      ),
    );
    if (ok && context.mounted) Navigator.of(context).pop(true);
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.spec,
    required this.query,
    required this.onApply,
    required this.onClear,
  });

  final ModuleSpec spec;
  final Map<String, String> query;
  final void Function(Map<String, String>) onApply;
  final VoidCallback onClear;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late Map<String, String> _q;
  final _dates = <String, TextEditingController>{};

  @override
  void initState() {
    super.initState();
    _q = Map.of(widget.query)..removeWhere((k, _) => k == 'q');
    for (final f in widget.spec.filters) {
      if (f.kind == FilterKind.date) {
        _dates[f.key] = TextEditingController(text: _q[f.key] ?? '');
      }
    }
  }

  @override
  void dispose() {
    for (final c in _dates.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pick(FilterSpec f) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_dates[f.key]!.text) ?? now,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;
    final v = '${picked.year}-${picked.month.toString().padLeft(2, "0")}'
        '-${picked.day.toString().padLeft(2, "0")}';
    setState(() {
      _dates[f.key]!.text = v;
      _q[f.key] = v;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final f in widget.spec.filters) ...[
        Overline(f.label),
        const SizedBox(height: 8),
        if (f.kind == FilterKind.date)
          Btn(
            _dates[f.key]!.text.isEmpty ? 'Any date' : _dates[f.key]!.text,
            emphasis: Emphasis.outline,
            icon: Icons.event_rounded,
            expand: true,
            onPressed: () => _pick(f),
          )
        else
          Wrap(spacing: 7, runSpacing: 7, children: [
            for (final o in f.options)
              FilterChip2(
                label: o.$2,
                selected: _q[f.key] == o.$1,
                onTap: () => setState(() {
                  if (_q[f.key] == o.$1) {
                    _q.remove(f.key);
                  } else {
                    _q[f.key] = o.$1;
                  }
                }),
              ),
          ]),
        const SizedBox(height: 16),
      ],
      Row(children: [
        Expanded(
          child: Btn('Clear all',
              emphasis: Emphasis.outline, height: 50, expand: true, onPressed: widget.onClear),
        ),
        const SizedBox(width: 9),
        Expanded(
          flex: 2,
          child: Btn('Show results',
              height: 50, expand: true, onPressed: () => widget.onApply(_q)),
        ),
      ]),
    ]);
  }
}
