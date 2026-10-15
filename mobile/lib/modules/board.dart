import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/nav.dart';
import '../core/row.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'form_screen.dart';
import 'record_screen.dart';

/// Available Flats — the web's own availability board.
///
/// The web paints three states and nothing else: a flat is free, somebody is
/// holding it, or it is gone. The towers are chips, the floors are rows, each
/// flat is a tile, and the filters **fade** what they exclude rather than
/// removing it, so a tower does not change shape as they are used.
///
/// Everything here is sent: the towers and their words ("Tower A", "Cluster
/// B"), the three legend swatches, the chips, every flat's state, who is
/// holding it, and the buttons its panel carries.
class BoardScreen extends StatefulWidget {
  const BoardScreen({
    super.key,
    required this.api,
    required this.board,
    required this.onChanged,
    this.forms = const [],
  });

  final Api api;
  final ScreenBoardDef board;

  /// The buttons the web's board page carries in its header — "+ Add units",
  /// and a single flat — as the server lists them for this screen.
  final List<FormRef> forms;

  /// Something was held, released or removed — the list behind this reloads.
  final Future<void> Function() onChanged;

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  String _block = '';
  String _status = 'all';
  String _type = 'all';

  BoardBlock? get _tower {
    final blocks = widget.board.blocks;
    if (blocks.isEmpty) return null;
    return blocks.firstWhere((b) => b.id == _block, orElse: () => blocks.first);
  }

  /// The design keeps every flat on the board and fades the ones a filter
  /// excludes.
  bool _dimmed(BoardFlat f) =>
      !((_status == 'all' || f.state == _status) && (_type == 'all' || f.type == _type));

  @override
  Widget build(BuildContext context) {
    final tower = _tower;
    final flats = tower?.flats ?? const <BoardFlat>[];

    // Floors, highest first — as the web stacks them.
    final floors = <int, List<BoardFlat>>{};
    for (final f in flats) {
      floors.putIfAbsent(f.floor, () => []).add(f);
    }
    final rows = floors.entries.toList()..sort((a, b) => b.key.compareTo(a.key));

    int count(String state) => flats.where((f) => f.state == state).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 24),
      children: [
        // What the web's board page offers in its own header.
        if (widget.forms.isNotEmpty) ...[
          Wrap(spacing: 7, runSpacing: 7, children: [
            for (final f in widget.forms)
              Btn(
                f.title,
                key: Key('board-form:${f.key}'),
                emphasis: Emphasis.outline,
                icon: Icons.add_rounded,
                height: 40,
                onPressed: () => _make(f),
              ),
          ]),
          const SizedBox(height: 11),
        ],
        // The three-colour legend, in the web's own words.
        Wrap(
          spacing: 12,
          runSpacing: 6,
          children: [
            for (final l in widget.board.legend)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: toneOf(l.tone).fill,
                    border: Border.all(color: toneOf(l.tone).line),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: 5),
                Text(l.text, style: T.caption().copyWith(fontWeight: FontWeight.w600)),
              ]),
          ],
        ),
        const SizedBox(height: 11),

        // Towers.
        if (widget.board.blocks.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final b in widget.board.blocks) ...[
                FilterChip2(
                  label: b.name,
                  selected: b.id == tower?.id,
                  onTap: () => setState(() => _block = b.id),
                ),
                const SizedBox(width: 7),
              ],
            ]),
          ),

        // Status, then type — the web's own two rows of chips.
        const SizedBox(height: 9),
        const Overline('Status'),
        const SizedBox(height: 7),
        Wrap(spacing: 7, runSpacing: 7, children: [
          for (final f in widget.board.filters)
            FilterChip2(
              label: f.label,
              selected: _status == f.value,
              onTap: () => setState(() => _status = f.value),
            ),
        ]),
        if (widget.board.types.isNotEmpty) ...[
          const SizedBox(height: 11),
          const Overline('Type'),
          const SizedBox(height: 7),
          Wrap(spacing: 7, runSpacing: 7, children: [
            FilterChip2(label: 'All', selected: _type == 'all', onTap: () => setState(() => _type = 'all')),
            for (final t in widget.board.types)
              FilterChip2(label: t, selected: _type == t, onTap: () => setState(() => _type = t)),
          ]),
        ],

        // The tower's figures, as the right rail counts them.
        const SizedBox(height: 12),
        Row(children: [
          _Figure(count('AVAILABLE'), 'Available', Tone.good),
          const SizedBox(width: 8),
          _Figure(count('HELD'), 'On hold', Tone.warn),
          const SizedBox(width: 8),
          _Figure(count('BOOKED'), 'Booked', Tone.bad),
        ]),

        // The board.
        const SizedBox(height: 12),
        Panel(
          padding: const EdgeInsets.fromLTRB(11, 11, 11, 11),
          child: rows.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 26),
                  child: Text(widget.board.emptyTower,
                      textAlign: TextAlign.center,
                      style: T.body(color: T.muted, weight: FontWeight.w500)),
                )
              : Column(children: [
                  for (final row in rows) ...[
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(
                        width: 34,
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text('Fl ${row.key}',
                              textAlign: TextAlign.center,
                              style: T.caption().copyWith(fontWeight: FontWeight.w700)),
                        ),
                      ),
                      Expanded(
                        child: Wrap(
                          spacing: 7,
                          runSpacing: 7,
                          children: [
                            for (final f in row.value)
                              _Tile(
                                flat: f,
                                dimmed: _dimmed(f),
                                onTap: () => _panel(f),
                              ),
                          ],
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),
                  ],
                ]),
        ),

        if ((widget.board.priceList ?? '').isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(widget.board.priceList!,
              style: T.caption().copyWith(fontWeight: FontWeight.w500)),
        ],
      ],
    );
  }

  /// The web's right-rail panel, which a phone shows as a sheet: the flat, who
  /// holds it, and what may be done to it.
  void _panel(BoardFlat f) {
    sheet<void>(
      context,
      title: 'Unit ${f.number}',
      explain: f.summary,
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (f.holderName != null) ...[
          Panel(
            padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Overline(f.holderLabel ?? ''),
                  const SizedBox(height: 2),
                  Text(f.holderName!, style: T.rowTitle()),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 10),
        ],
        for (final a in f.actions) ...[
          Btn(
            '${a["label"]}',
            key: Key('flat-action:${f.id}:${a["key"]}'),
            emphasis: emphasisOf('${a["emphasis"]}'),
            height: 48,
            expand: true,
            onPressed: () async {
              Navigator.pop(ctx);
              await _run(f, a);
            },
          ),
          const SizedBox(height: 8),
        ],
        Btn(
          f.open,
          key: Key('flat-open:${f.id}'),
          emphasis: Emphasis.outline,
          icon: Icons.chevron_right_rounded,
          height: 48,
          expand: true,
          onPressed: () {
            Navigator.pop(ctx);
            _open(f);
          },
        ),
      ]),
    );
  }

  Future<void> _make(FormRef form) async {
    final made = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => FormScreen(api: widget.api, formKey: form.key),
    ));
    if (made == true) await widget.onChanged();
  }

  Future<void> _run(BoardFlat f, Map<String, dynamic> a) async {
    // A button may point at fields the board sent once, rather than carrying
    // the same list of customers on all hundred flats.
    final from = a['fieldsFrom'] as String?;
    final filled = from == null
        ? a
        : {...a, 'fields': widget.board.fieldSets[from] ?? const <Map<String, dynamic>>[]};
    final navigator = Navigator.of(context);
    final ok = await runServerAction(
      context,
      widget.api,
      filled,
      recordId: f.id,
      openForm: (formKey) async {
        final made = await navigator.push<bool>(MaterialPageRoute(
          builder: (_) => FormScreen(api: widget.api, formKey: formKey, recordId: f.id),
        ));
        return made == true;
      },
    );
    if (ok) await widget.onChanged();
  }

  Future<void> _open(BoardFlat f) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => RecordScreen(
        api: widget.api,
        module: 'units',
        id: f.id,
        fallbackTitle: 'Unit ${f.number}',
      ),
    ));
    if (changed == true) await widget.onChanged();
  }
}

/// One flat: its number and its plan, in the colour of its state.
class _Tile extends StatelessWidget {
  const _Tile({required this.flat, required this.dimmed, required this.onTap});

  final BoardFlat flat;
  final bool dimmed;
  final VoidCallback onTap;

  Tone get _tone => switch (flat.state) {
        'AVAILABLE' => Tone.good,
        'HELD' => Tone.warn,
        _ => Tone.bad,
      };

  @override
  Widget build(BuildContext context) {
    final c = toneOf(_tone);
    return Opacity(
      opacity: dimmed ? .18 : 1,
      child: SizedBox(
        width: 74,
        child: Material(
          color: c.fill,
          borderRadius: BorderRadius.circular(9),
          child: InkWell(
            key: Key('flat:${flat.id}'),
            onTap: dimmed ? null : onTap,
            borderRadius: BorderRadius.circular(9),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              decoration: BoxDecoration(
                border: Border.all(color: c.line),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Column(children: [
                Text(flat.number,
                    style: T.num(11.5, color: c.ink, weight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 1),
                Text(flat.type ?? '—',
                    style: T.num(9.5, color: c.ink, weight: FontWeight.w500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// One of the right rail's three counts.
class _Figure extends StatelessWidget {
  const _Figure(this.value, this.label, this.tone);
  final int value;
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(tone);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(11, 9, 11, 9),
        decoration: BoxDecoration(
          color: c.fill,
          border: Border.all(color: c.line),
          borderRadius: BorderRadius.circular(T.rBand),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$value', style: T.metric(19)),
          Text(label, style: T.caption(color: c.ink).copyWith(fontSize: 11)),
        ]),
      ),
    );
  }
}
