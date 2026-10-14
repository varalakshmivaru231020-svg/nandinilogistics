import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/form.dart';
import 'form_screen.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// One record, as the server describes it.
///
/// Everything on this screen is decided by the server: which fields it shows,
/// which children it has, and what may be done to it or to any one of its rows.
/// The app had none of this — a detail screen was built from the list row, so a
/// task had no checklist, an indent had no lines, and nothing could be pressed.
class RecordScreen extends StatefulWidget {
  const RecordScreen({
    super.key,
    required this.api,
    required this.module,
    required this.id,
    this.fallbackTitle,
  });

  final Api api;

  /// The list key — "tasks", "material/indents".
  final String module;
  final String id;
  final String? fallbackTitle;

  @override
  State<RecordScreen> createState() => RecordScreenState();
}

Tone _tone(String? raw) => switch (raw) {
      'good' => Tone.good,
      'warn' => Tone.warn,
      'bad' => Tone.bad,
      'plum' => Tone.plum,
      'info' => Tone.info,
      _ => Tone.draft,
    };

class RecordScreenState extends State<RecordScreen> {
  bool _loading = true;
  String? _error;
  String? _code;
  Map<String, dynamic>? _rec;
  bool _changed = false;

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
    final res = await widget.api.get('/record/${widget.module}/${widget.id}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok) {
        _rec = res.data;
      } else {
        _error = res.error;
        _code = res.code;
      }
    });
  }

  List<Map<String, dynamic>> _list(String key) =>
      ((_rec?[key] as List?) ?? const []).cast<Map<String, dynamic>>();

  @override
  Widget build(BuildContext context) {
    final actions = _list('actions');

    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (_, __) {},
      child: Scaffold(
        backgroundColor: T.page,
        body: Column(children: [
          Bar(
            title: (_rec?['title'] as String?) ?? widget.fallbackTitle ?? 'Record',
            subtitle: _rec?['subtitle'] as String?,
            onBack: () => Navigator.of(context).pop(_changed),
            titleStyle: T.barTitle().copyWith(fontSize: 17),
            actions: [
              BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load),
            ],
            pills: [
              for (final p in _list('pills'))
                Pill('${p["label"]}',
                    solid: (bg: toneOf(_tone(p['tone'] as String?)).ink, ink: Colors.white)),
            ],
          ),
          Expanded(child: RefreshIndicator(onRefresh: _load, child: _body())),

          /*
           * One primary action, with the rest beneath it — the design's rule.
           * A record with four things you can do to it gets the first on the
           * bar and the others in a sheet, rather than four equal buttons
           * nobody can choose between.
           */
          if (actions.isNotEmpty)
            ActionBar(children: [
              if (actions.length > 1) ...[
                Expanded(
                  child: Btn('More',
                      emphasis: Emphasis.outline,
                      height: 52,
                      expand: true,
                      onPressed: () => _moreActions(actions.skip(1).toList())),
                ),
                const SizedBox(width: 9),
              ],
              Expanded(
                flex: 2,
                child: Btn(
                  '${actions.first["label"]}',
                  emphasis: _emphasis('${actions.first["emphasis"]}'),
                  height: 52,
                  expand: true,
                  onPressed: () => _run(actions.first),
                ),
              ),
            ]),
        ]),
      ),
    );
  }

  Emphasis _emphasis(String raw) => switch (raw) {
        'approve' => Emphasis.approve,
        'reject' => Emphasis.reject,
        'outline' => Emphasis.outline,
        _ => Emphasis.primary,
      };

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return ListView(padding: const EdgeInsets.all(T.gutter), children: [
        Alert(
          _error!,
          tone: _code == 'unknown-record' ? Tone.warn : Tone.bad,
          detail: _code == 'unknown-record'
              ? 'Its list and its filters work; the full record screen for this '
                  'module is being built.'
              : null,
        ),
        if (_code != 'unknown-record') ...[
          const SizedBox(height: 12),
          Btn('Try again', emphasis: Emphasis.outline, expand: true, onPressed: _load),
        ],
      ]);
    }

    final chain = _list('chain');
    final sections = _list('sections');
    final collections = _list('collections');

    return ListView(
      padding: const EdgeInsets.fromLTRB(T.gutter, 13, T.gutter, 24),
      children: [
        if (chain.isNotEmpty) ...[
          Panel(
            child: Chain([
              for (final s in chain)
                ChainStep(
                  '${s["initials"]}',
                  switch (s['state']) {
                    'done' => ChainState.done,
                    'current' => ChainState.current,
                    _ => ChainState.pending,
                  },
                ),
            ]),
          ),
          const SizedBox(height: 11),
        ],
        for (final s in sections) ...[
          _Section(section: s),
          const SizedBox(height: 11),
        ],
        for (final c in collections) ...[
          _Collection(
            collection: c,
            onRun: _run,
          ),
          const SizedBox(height: 11),
        ],
      ],
    );
  }

  void _moreActions(List<Map<String, dynamic>> rest) {
    sheet<void>(
      context,
      title: 'What else you can do',
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final a in rest)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Btn('${a["label"]}',
                emphasis: _emphasis('${a["emphasis"]}'),
                height: 50,
                expand: true,
                onPressed: () {
                  Navigator.pop(ctx);
                  _run(a);
                }),
          ),
      ]),
    );
  }

  Future<void> _run(Map<String, dynamic> a) async {
    // An action that opens a form has nothing to call until it is filled in.
    final form = a['form'] as String?;
    if (form != null && form.isNotEmpty) {
      final navigator = Navigator.of(context);
      final made = await navigator.push<bool>(MaterialPageRoute(
        builder: (_) => FormScreen(api: widget.api, formKey: form, recordId: widget.id),
      ));
      if (made != true) return;
      _changed = true;
      await _load();
      return;
    }

    final ok = await confirmAndRun(
      context,
      widget.api,
      Act(
        action: '${a["action"]}',
        args: ((a['args'] as List?) ?? const []).cast<Object?>(),
        label: '${a["label"]}',
        title: '${a["label"]}',
        explain: a['confirm'] as String?,
        emphasis: _emphasis('${a["emphasis"]}'),
        remark: switch (a['remark']) {
          'required' => RemarkMode.required,
          'optional' => RemarkMode.optional,
          _ => RemarkMode.none,
        },
        remarkLabel: (a['remarkLabel'] as String?) ?? 'Remark',
        // Where the action needs more than a remark — a new finish date — the
        // server sends the fields to ask for, and the sheet collects them.
        fields: ((a['fields'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(FieldDef.from)
            .toList(),
        done: '${a["label"]} — done.',
      ),
    );
    if (!ok) return;
    _changed = true;
    await _load();
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.section});
  final Map<String, dynamic> section;

  @override
  Widget build(BuildContext context) {
    final fields = ((section['fields'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final shown = fields.where((f) => f['value'] != null && '${f["value"]}'.isNotEmpty).toList();
    if (shown.isEmpty) return const SizedBox.shrink();

    final narrow = shown.where((f) => f['wide'] != true).toList();
    final wide = shown.where((f) => f['wide'] == true).toList();

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Overline('${section["label"]}'),
        const SizedBox(height: 10),
        for (final f in narrow) _line(f),
        for (final f in wide) ...[
          const SizedBox(height: 4),
          Text('${f["label"]}', style: T.caption()),
          const SizedBox(height: 3),
          Text(_value(f), style: T.body()),
          const SizedBox(height: 6),
        ],
      ]),
    );
  }

  String _value(Map<String, dynamic> f) {
    final v = f['value'];
    if (v == null) return '—';
    switch (f['format']) {
      case 'money':
        return money(v as num?);
      case 'date':
        return shortDate(v);
      case 'datetime':
        final d = DateTime.tryParse('$v')?.toLocal();
        return d == null
            ? shortDate(v)
            : '${shortDate(v)}, ${d.hour.toString().padLeft(2, "0")}:${d.minute.toString().padLeft(2, "0")}';
      case 'bool':
        return v == true ? 'Yes' : 'No';
      default:
        return '$v'.replaceAll('_', ' ');
    }
  }

  Widget _line(Map<String, dynamic> f) {
    final v = _value(f);
    final numeric = f['format'] == 'money' || f['format'] == 'number' ||
        RegExp(r'^[\d,.₹ /-]+$').hasMatch(v);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 118, child: Text('${f["label"]}', style: T.caption())),
        Expanded(
          child: Text(v,
              style: numeric ? T.num(14, weight: FontWeight.w600) : T.body(weight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

/// A child collection — a checklist, the item lines, the comments. Its rows
/// carry their own actions, because a checklist point is settled point by
/// point rather than by a verdict on the whole task.
class _Collection extends StatelessWidget {
  const _Collection({required this.collection, required this.onRun});

  final Map<String, dynamic> collection;
  final Future<void> Function(Map<String, dynamic>) onRun;

  @override
  Widget build(BuildContext context) {
    final rows = ((collection['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();

    return Panel(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Color(0xFFEEF1F8))),
          ),
          child: Overline('${collection["label"]}'),
        ),
        if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.all(14),
            child: Text('${collection["emptyMessage"] ?? "Nothing here."}',
                style: T.secondaryText()),
          ),
        for (final (i, r) in rows.indexed) _row(r, last: i == rows.length - 1),
      ]),
    );
  }

  Widget _row(Map<String, dynamic> r, {required bool last}) {
    final pills = ((r['pills'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final actions = ((r['actions'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final trailing = r['trailing'] as String?;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFF0F3FA))),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (trailing != null && trailing.length <= 3) ...[
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: T.fieldFill,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(trailing, style: T.num(11, color: T.secondary, weight: FontWeight.w800)),
            ),
            const SizedBox(width: 11),
          ],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${r["title"]}', style: T.body(weight: FontWeight.w600)),
              if (r['subtitle'] != null && '${r["subtitle"]}'.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('${r["subtitle"]}',
                      style: T.caption().copyWith(fontWeight: FontWeight.w500)),
                ),
            ]),
          ),
          if (trailing != null && trailing.length > 3)
            Text(trailing, style: T.num(14, weight: FontWeight.w700)),
        ]),
        if (r['body'] != null && '${r["body"]}'.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 7),
            child: Text('${r["body"]}', style: T.secondaryText()),
          ),
        if (pills.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              for (final p in pills)
                Pill('${p["label"]}', tone: _tone(p['tone'] as String?), compact: true),
            ]),
          ),
        if (actions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 9),
            child: Row(children: [
              for (final (i, a) in actions.indexed) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: Btn('${a["label"]}',
                      emphasis: '${a["emphasis"]}' == 'approve'
                          ? Emphasis.approve
                          : '${a["emphasis"]}' == 'reject'
                              ? Emphasis.reject
                              : Emphasis.outline,
                      height: 40,
                      expand: true,
                      onPressed: () => onRun(a)),
                ),
              ],
            ]),
          ),
      ]),
    );
  }
}
