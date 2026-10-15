import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/act.dart';
import '../core/nav.dart';
import '../core/row.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'board.dart';
import 'form_screen.dart';
import 'record_screen.dart';

/// A module's list, drawn to the pattern the canvas sets for one.
///
/// The canvas draws this list once — on Indents — and reuses it, with the band,
/// the chips, the row and the actions changing per module. The pattern is here;
/// **the specifics are the web's**, sent by `/screen/<key>` and `/list/<key>`.
///
/// It used to be the other way round: `spec.dart` held a hand-written idea of
/// every list — its title, its row, its figures, its filters — and the two
/// drifted the moment the web changed a word.
class ModuleScreen extends StatefulWidget {
  const ModuleScreen({
    super.key,
    required this.api,
    required this.session,
    required this.moduleKey,
    required this.onBack,
    required this.bottom,
    required this.onPickProject,
    required this.onOpenRelated,
  });

  final Api api;
  final Session session;

  /// The list's key, which is also the module key. Everything else about the
  /// screen — its title, its placeholder, its filters, its rows, its band —
  /// comes from the server.
  final String moduleKey;
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
    if (oldWidget.moduleKey != widget.moduleKey) {
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
    if (_screen == null || _screen!.key != widget.moduleKey) {
      final d = await widget.api.get('/screen/${widget.moduleKey}');
      if (!mounted) return;
      if (d.ok) _screen = ScreenDef.from(d.data!);
    }

    final res = await widget.api.get('/list/${widget.moduleKey}', query: {
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
    final res = await widget.api.get('/list/${widget.moduleKey}', query: {
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
    final related = relatedScreens[widget.moduleKey] ?? const [];
    sheet<void>(
      context,
      title: 'More in ${_screen?.title ?? widget.moduleKey}',
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
    final rows = _rows;
    final now = _page?.serverTime ?? DateTime.now().millisecondsSinceEpoch;

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: _screen?.title ?? '',
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
            if (relatedScreens[widget.moduleKey] != null)
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
            if ((_screen?.filters ?? const []).isNotEmpty)
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
              hint: _screen?.searchPlaceholder ?? 'Search',
              onSubmit: () => _set('q', _search.text),
              suffix: IconButton(
                tooltip: 'Search',
                icon: const Icon(Icons.search_rounded, size: 20, color: T.brand700),
                onPressed: () => _set('q', _search.text),
              ),
            ),
          ),
        // The web's own band, read over every row in scope rather than the page
        // on screen — which is what the web's second query is for. A board has
        // its own figures, beside its own chips.
        if (!_loading &&
            _error == null &&
            _page?.screen?.board == null &&
            (_page?.screen?.band ?? const []).isNotEmpty)
          Band(_page!.screen!.band),
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
    return '$key: $value';
  }

  Widget _body(List<Map<String, dynamic>> rows, int now) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    // Available Flats is a board, not a list — the web's own screen for this
    // key is `/units/board`, and the server sends the board itself.
    final board = _page?.screen?.board;
    if (board != null) {
      return BoardScreen(api: widget.api, board: board, onChanged: _load);
    }

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
          empty?.emptyTitle ?? 'Nothing matches',
          detail: empty?.emptyDetail ??
              (_page!.filters.isNotEmpty ? 'Applied: ${_page!.filters}' : null),
        ),
      ]);
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(T.gutter, 11, T.gutter, 20),
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
        // Composed by the server where the list composes a row, and read off
        // the columns where it is a report — which is all the web shows there
        // too.
        return ServerRowCard(
          drawn: i < _drawn.length
              ? _drawn[i]
              : ServerRow.fromColumns(_page?.columns ?? const [], rows[i]),
          row: rows[i],
          moduleKey: widget.moduleKey,
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
      title: 'Filter ${(_screen?.title ?? "").toLowerCase()}',
      explain: 'The same filters the web toolbar has. The server says in words '
          'what it applied, and that line is at the foot of the list.',
      body: (ctx) => _FilterSheet(
        screen: _screen,
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


/// The filter sheet — the web toolbar's own filters, as the server sends them.
class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.screen,
    required this.query,
    required this.onApply,
    required this.onClear,
  });

  /// The web's own filters. Null only while the descriptor has not been read.
  final ScreenDef? screen;

  final Map<String, String> query;
  final void Function(Map<String, String>) onApply;
  final VoidCallback onClear;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late Map<String, String> _q;
  final _dates = <String, TextEditingController>{};

  /// The web's filters, as the server describes them.
  List<ScreenFilter> get _filters => widget.screen?.filters ?? const [];

  /// "From"/"To", captioned with whatever the web calls the range — "Raised",
  /// "Received", "PO date".
  String? get _rangeLabel => widget.screen?.dateRangeLabel;

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
    return Column(
      key: const Key('filter-sheet'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
    required this.moduleKey,
    required this.api,
    required this.onChanged,
    this.hasRecord = false,
  });

  final ServerRow drawn;

  /// The plain row behind it, which still carries `decide`.
  final Map<String, dynamic> row;
  final String moduleKey;
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
        if (!hasRecord || drawn.id.isEmpty) {
          // A report has no record behind its rows, and neither does the web's.
          notify(context, 'This screen is a report — its rows do not open.');
          return;
        }
        final changed = await navigator.push<bool>(MaterialPageRoute(
          builder: (_) => RecordScreen(
            api: api,
            module: moduleKey,
            id: drawn.id,
            fallbackTitle: drawn.title,
          ),
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
        /*
         * The buttons the web's own row carries. Which ones appear is the
         * server's decision — the same `…Decisions` the record screen asks —
         * and `authorize()` checks again inside the action regardless.
         */
        if (drawn.actions.isNotEmpty) ...[
          const SizedBox(height: 11),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              for (final a in drawn.actions)
                Btn(
                  '${a["label"]}',
                  key: Key('row-action:${drawn.id}:${a["key"]}'),
                  emphasis: emphasisOf('${a["emphasis"]}'),
                  height: 38,
                  onPressed: () => _run(context, a),
                ),
            ],
          ),
        ],
      ]),
    );
  }

  Future<void> _run(BuildContext context, Map<String, dynamic> a) async {
    final navigator = Navigator.of(context);
    final ok = await runServerAction(
      context,
      api,
      a,
      recordId: drawn.id,
      openForm: (formKey) async {
        final made = await navigator.push<bool>(MaterialPageRoute(
          builder: (_) => FormScreen(api: api, formKey: formKey, recordId: drawn.id),
        ));
        return made == true;
      },
    );
    if (ok) await onChanged();
  }
}
