import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/nav.dart';
import '../core/row.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'form_screen.dart';
import 'record_screen.dart';
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
    required this.onOpenRelated,
  });

  final Api api;
  final Session session;
  final ModuleSpec spec;
  final VoidCallback onBack;
  final Widget bottom;

  /// Opens the workspace chooser, for a module that needs one.
  final VoidCallback onPickProject;

  /// Opens a screen the web reaches from inside this one.
  final void Function(String moduleKey) onOpenRelated;

  @override
  State<ModuleScreen> createState() => ModuleScreenState();
}

class ModuleScreenState extends State<ModuleScreen> {
  bool _loading = true;
  String? _error;

  /// How this screen is laid out, as the server describes it — the placeholder
  /// it shows, the filters it offers and what each is called. Read from the
  /// boundary rather than written here, so a label cannot differ from the web's.
  ScreenDef? _screen;

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
      _screen = null;
      _load();
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// How many rows a page carries. The web reads thirty indents and fifty
  /// units to a page; a phone over a site connection cannot read a whole list
  /// of twenty thousand, so it walks them.
  static const _pageSize = 50;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _rows = const [];
      _drawn = const [];
      _more = false;
    });

    // The descriptor once per screen; the rows on every refresh.
    if (_screen == null || _screen!.key != widget.spec.key) {
      final d = await widget.api.get('/screen/${widget.spec.key}');
      if (!mounted) return;
      if (d.ok) _screen = ScreenDef.from(d.data!);
    }

    final res = await widget.api.get('/list/${widget.spec.key}', query: {
      ..._query,
      'page': '1',
      'pageSize': '$_pageSize',
    });
    if (!mounted) return;
    setState(() {
      _loading = false;
      _needsProject = res.code == 'project-required';
      if (res.ok) {
        _page = ListPage.from(res.data!);
        _rows = _page!.rows;
        _drawn = _page!.screen?.rows ?? const [];
        _more = _page!.hasMore;
      } else {
        _error = _needsProject ? null : res.error;
        _page = null;
      }
    });
  }

  /// The next page, appended. The filters and the search are the ones already
  /// applied, so a page cannot show a row the whole list would not have.
  Future<void> _loadMore() async {
    if (_loadingMore || !_more || _page == null) return;
    setState(() => _loadingMore = true);

    final next = (_page!.page ?? 1) + 1;
    final res = await widget.api.get('/list/${widget.spec.key}', query: {
      ..._query,
      'page': '$next',
      'pageSize': '$_pageSize',
    });
    if (!mounted) return;
    setState(() {
      _loadingMore = false;
      if (!res.ok) {
        // The page that failed is not the list's problem; say so and stop.
        _moreError = res.error;
        _more = false;
        return;
      }
      final page = ListPage.from(res.data!);
      _page = page;
      _rows = [..._rows, ...page.rows];
      _drawn = [..._drawn, ...(page.screen?.rows ?? const [])];
      _more = page.hasMore;
    });
  }

  List<Map<String, dynamic>> _rows = const [];

  /// The same rows, composed by the server. Empty for a module whose list does
  /// not compose them yet.
  List<ServerRow> _drawn = const [];
  bool _more = false;
  bool _loadingMore = false;
  String? _moreError;

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

  /// The noun the web counts in — "indents", "purchase orders", "receipts".
  String _noun(int n) {
    final noun = _screen?.countNoun;
    if (noun == null) return n == 1 ? 'record' : 'records';
    if (n == 1 && noun.endsWith('s')) return noun.substring(0, noun.length - 1);
    if (n != 1 && !noun.endsWith('s')) return '${noun}s';
    return noun;
  }

  void _openRelated() {
    final related = relatedScreens[widget.spec.key] ?? const [];
    sheet<void>(
      context,
      title: 'More in ${_screen?.title ?? widget.spec.title}',
      explain: 'The web reaches these from inside this screen rather than from '
          'the menu, so they are here rather than in the drawer.',
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final (key, label) in related)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Btn(label,
                emphasis: Emphasis.outline,
                icon: Icons.chevron_right_rounded,
                height: 50,
                expand: true,
                onPressed: () {
                  Navigator.pop(ctx);
                  widget.onOpenRelated(key);
                }),
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    final rows = _rows;
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
          title: _screen?.title ?? spec.title,
          subtitle: _loading
              ? 'Loading…'
              // "12 indents", in the web's own noun — not "12 records".
              // What matches, not what has been fetched so far.
              : '${_page?.total ?? rows.length} ${_noun(_page?.total ?? rows.length)} · '
                  '${widget.session.project?.code ?? "All projects"}',
          onBack: widget.onBack,
          actions: [
            // The web's "New …" button, where this person may use it.
            if ((_screen?.forms ?? const []).isNotEmpty)
              BarButton(
                icon: Icons.add_rounded,
                label: _screen!.forms.length == 1 ? _screen!.forms.first.title : 'New',
                onTap: _create,
              ),
            if (relatedScreens[spec.key] != null)
              BarButton(
                icon: Icons.more_vert_rounded,
                label: 'Related screens',
                onTap: _openRelated,
              ),
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
              // The web's own placeholder, which names the fields it searches.
              hint: _screen?.searchPlaceholder ?? spec.searchHint,
              onSubmit: () => _set('q', _search.text),
              suffix: IconButton(
                tooltip: 'Search',
                icon: const Icon(Icons.search_rounded, size: 20, color: T.brand700),
                onPressed: () => _set('q', _search.text),
              ),
            ),
          ),
        if (!_loading && _error == null)
          if ((_page?.screen?.band ?? const []).isNotEmpty)
            // The web's own band, read over every row in scope rather than the
            // page on screen — which is what the web's second query is for.
            Band(_page!.screen!.band)
          else if (spec.figures != null)
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

  /// An applied filter reads as the web names it — "Invoice pending", not
  /// "invoice: PENDING".
  String _chipLabel(String key, String value) {
    if (key == 'q') return '“$value”';
    if (key == 'from') return 'From $value';
    if (key == 'to') return 'To $value';

    final f = _screen?.filters.where((f) => f.name == key).firstOrNull;
    if (f != null) {
      final o = f.options.where((o) => o.value == value).firstOrNull;
      return o?.label ?? '${f.label}: $value';
    }
    final fallback = widget.spec.filters.where((f) => f.key == key).firstOrNull;
    if (fallback == null) return '$key: $value';
    final o = fallback.options.where((o) => o.$1 == value).firstOrNull;
    return o == null ? '${fallback.label}: $value' : o.$2;
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
      final empty = _page?.screen;
      return ListView(children: [
        const SizedBox(height: 16),
        Empty(
          empty?.emptyTitle ?? 'No ${widget.spec.title.toLowerCase()} match',
          detail: empty?.emptyDetail ??
              (_page!.filters.isNotEmpty ? 'Applied: ${_page!.filters}' : null),
        ),
      ]);
    }

    return ListView.separated(
      padding: EdgeInsets.fromLTRB(
          T.gutter, 11, T.gutter, widget.spec.createLabel == null ? 20 : 90),
      itemCount: rows.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: 9),
      itemBuilder: (_, i) {
        if (i == rows.length) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_more) ...[
              const SizedBox(height: 4),
              Btn(
                _loadingMore ? 'Loading…' : 'Load the next $_pageSize',
                key: const Key('load-more'),
                emphasis: Emphasis.outline,
                busy: _loadingMore,
                expand: true,
                onPressed: _loadMore,
              ),
              const SizedBox(height: 8),
              Text('${rows.length} of ${_page?.total ?? rows.length} loaded',
                  style: T.caption().copyWith(fontWeight: FontWeight.w500),
                  textAlign: TextAlign.center),
            ],
            if (_moreError != null) ...[
              const SizedBox(height: 8),
              Alert(_moreError!),
            ],
            if (_page != null && _page!.filters.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_page!.filters,
                    style: T.caption().copyWith(fontWeight: FontWeight.w500)),
              ),
            if ((_page?.screen?.note ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_page!.screen!.note!,
                    style: T.caption().copyWith(fontWeight: FontWeight.w500)),
              ),
          ]);
        }
        // Composed by the server where the module composes it; the module's
        // own row only where it does not.
        if (i < _drawn.length) {
          return ServerRowCard(
            drawn: _drawn[i],
            row: rows[i],
            spec: widget.spec,
            api: widget.api,
            onChanged: _load,
            hasRecord: _screen?.record ?? false,
          );
        }
        return SpecRow(
          spec: widget.spec,
          row: rows[i],
          nowMs: now,
          api: widget.api,
          onChanged: _load,
          hasRecord: _screen?.record ?? false,
        );
      },
    );
  }

  /// Opening the create form. One form goes straight there; more than one asks.
  Future<void> _create() async {
    final forms = _screen?.forms ?? const <FormRef>[];
    if (forms.isEmpty) return;

    final navigator = Navigator.of(context);
    FormRef? pick = forms.first;
    if (forms.length > 1) {
      pick = await sheet<FormRef>(
        context,
        title: 'What are you making?',
        body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (final f in forms)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Btn(f.title,
                  emphasis: Emphasis.outline,
                  height: 50,
                  expand: true,
                  onPressed: () => Navigator.pop(ctx, f)),
            ),
        ]),
      );
    }
    if (pick == null) return;

    final made = await navigator.push<bool>(MaterialPageRoute(
      builder: (_) => FormScreen(api: widget.api, formKey: pick!.key),
    ));
    if (made == true) await _load();
  }

  void _openFilters() {
    sheet<void>(
      context,
      title: 'Filter ${widget.spec.title.toLowerCase()}',
      explain: 'The same filters the web toolbar has. The server says in words '
          'what it applied, and that line is at the foot of the list.',
      body: (ctx) => _FilterSheet(
        screen: _screen,
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
    this.hasRecord = false,
  });

  final ModuleSpec spec;
  final Map<String, dynamic> row;
  final int nowMs;
  final Api api;
  final Future<void> Function() onChanged;

  /// Whether this module's record screen is built. The server says.
  final bool hasRecord;

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
        // Taken before the await, so the lint and the reader can both see that
        // no context crosses it.
        final navigator = Navigator.of(context);
        /*
         * The record, from the server — with its children and its actions —
         * wherever that module has one. Where it does not, the row still
         * opens what the list row itself holds, which is better than a tap
         * that does nothing.
         */
        final open = hasRecord && row['id'] != null;
        final changed = await navigator.push<bool>(MaterialPageRoute(
          builder: (_) => open
              ? RecordScreen(
                  api: api,
                  module: spec.key,
                  id: '${row["id"]}',
                  fallbackTitle: spec.row.title(row),
                )
              : SpecDetail(spec: spec, row: row, api: api),
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
    final navigator = Navigator.of(context);
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
    if (ok) navigator.pop(true);
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.screen,
    required this.spec,
    required this.query,
    required this.onApply,
    required this.onClear,
  });

  /// The web's own filters. Null only if the descriptor could not be read, in
  /// which case the module's own fallback is used.
  final ScreenDef? screen;

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

  /// The web's filters where the descriptor came through, the module's own
  /// fallback where it did not.
  List<ScreenFilter> get _filters =>
      widget.screen?.filters ??
      widget.spec.filters
          .where((f) => f.kind == FilterKind.choice)
          .map((f) => ScreenFilter(
                name: f.key,
                label: f.label,
                allLabel: 'All',
                options: f.options.map((o) => (value: o.$1, label: o.$2)).toList(),
              ))
          .toList();

  /// "From"/"To", captioned with whatever the web calls the range — "Raised",
  /// "Received", "PO date".
  String? get _rangeLabel =>
      widget.screen?.dateRangeLabel ??
      (widget.spec.filters.any((f) => f.kind == FilterKind.date) ? 'Date' : null);

  @override
  void initState() {
    super.initState();
    _q = Map.of(widget.query)..removeWhere((k, _) => k == 'q');
    for (final key in ['from', 'to']) {
      _dates[key] = TextEditingController(text: _q[key] ?? '');
    }
  }

  @override
  void dispose() {
    for (final c in _dates.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pick(String key) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_dates[key]!.text) ?? now,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;
    final v = '${picked.year}-${picked.month.toString().padLeft(2, "0")}'
        '-${picked.day.toString().padLeft(2, "0")}';
    setState(() {
      _dates[key]!.text = v;
      _q[key] = v;
    });
  }

  @override
  Widget build(BuildContext context) {
    final range = _rangeLabel;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final f in _filters) ...[
        Overline(f.label),
        const SizedBox(height: 8),
        Wrap(spacing: 7, runSpacing: 7, children: [
          // The everything-option, in the web's own words.
          FilterChip2(
            label: f.allLabel,
            selected: !_q.containsKey(f.name),
            onTap: () => setState(() => _q.remove(f.name)),
          ),
          for (final o in f.options)
            FilterChip2(
              label: o.label,
              selected: _q[f.name] == o.value,
              onTap: () => setState(() {
                if (_q[f.name] == o.value) {
                  _q.remove(f.name);
                } else {
                  _q[f.name] = o.value;
                }
              }),
            ),
        ]),
        const SizedBox(height: 16),
      ],
      if (range != null) ...[
        Overline(range),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: Btn(_dates['from']!.text.isEmpty ? 'From' : _dates['from']!.text,
                emphasis: Emphasis.outline,
                icon: Icons.event_rounded,
                expand: true,
                onPressed: () => _pick('from')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Btn(_dates['to']!.text.isEmpty ? 'To' : _dates['to']!.text,
                emphasis: Emphasis.outline,
                icon: Icons.event_rounded,
                expand: true,
                onPressed: () => _pick('to')),
          ),
        ]),
        const SizedBox(height: 16),
      ],
      Row(children: [
        Expanded(
          child: Btn('Clear',
              emphasis: Emphasis.outline, height: 50, expand: true, onPressed: widget.onClear),
        ),
        const SizedBox(width: 9),
        Expanded(
          flex: 2,
          child: Btn('Show results',
              key: const Key('apply-filters'),
              height: 50,
              expand: true,
              onPressed: () => widget.onApply(_q)),
        ),
      ]),
    ]);
  }
}

/// A row the server composed, drawn as the web card draws it.
///
/// Nothing here decides anything: the title, the line under it, the labelled
/// columns, the chain, the fulfilment pill and the status all arrive worded
/// and toned. The card only lays them out to the pattern the canvas sets for
/// a list row, and opens the record behind it.
class ServerRowCard extends StatelessWidget {
  const ServerRowCard({
    super.key,
    required this.drawn,
    required this.row,
    required this.spec,
    required this.api,
    required this.onChanged,
    this.hasRecord = false,
  });

  final ServerRow drawn;

  /// The plain row behind it, which still carries `decide` and is what the
  /// fallback detail sheet reads where a module has no record screen yet.
  final Map<String, dynamic> row;
  final ModuleSpec spec;
  final Api api;
  final Future<void> Function() onChanged;
  final bool hasRecord;

  @override
  Widget build(BuildContext context) {
    final decide = row['decide'] as Map<String, dynamic>?;

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      border: decide != null ? T.warnLineStrong : T.line,
      onTap: () async {
        final navigator = Navigator.of(context);
        final open = hasRecord && drawn.id.isNotEmpty;
        final changed = await navigator.push<bool>(MaterialPageRoute(
          builder: (_) => open
              ? RecordScreen(
                  api: api,
                  module: spec.key,
                  id: drawn.id,
                  fallbackTitle: drawn.title,
                )
              : SpecDetail(spec: spec, row: row, api: api),
        ));
        if (changed == true) await onChanged();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(drawn.title,
                      style: T.rowTitle().copyWith(fontSize: 15),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                ),
                for (final c in drawn.chips) ...[
                  const SizedBox(width: 6),
                  KindTag(c.text, tone: c.tone),
                ],
              ]),
              if ((drawn.meta ?? '').isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(drawn.meta!,
                    style: T.num(12, color: T.muted, weight: FontWeight.w500),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
              ],
            ]),
          ),
          if (drawn.trailing != null) ...[
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(drawn.trailing!.value, style: T.metric(14)),
              if ((drawn.trailing!.label ?? '').isNotEmpty)
                Text(drawn.trailing!.label!, style: T.caption()),
            ]),
          ],
        ]),
        for (final l in drawn.lines)
          if (l.value.isNotEmpty && l.value != '—') ...[
            const SizedBox(height: 7),
            Text(
              l.label == null ? l.value : '${l.label}: ${l.value}',
              style: T.num(11.5, color: T.secondary, weight: FontWeight.w500),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        if (drawn.status != null || drawn.pill != null) ...[
          const SizedBox(height: 10),
          Row(children: [
            if (drawn.status != null) ...[
              Pill(drawn.status!.text, tone: drawn.status!.tone, compact: true),
              const SizedBox(width: 7),
            ],
            if (drawn.pill != null)
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Pill(drawn.pill!.label, tone: drawn.pill!.tone, compact: true),
                ),
              ),
          ]),
          if ((drawn.pill?.text ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(drawn.pill!.text!,
                style: T.num(11.5, color: T.muted, weight: FontWeight.w500),
                maxLines: 3),
          ],
        ],
        if (drawn.chain.isNotEmpty) ...[
          const SizedBox(height: 10),
          Chain(drawn.chain, size: 22),
        ],
      ]),
    );
  }
}
