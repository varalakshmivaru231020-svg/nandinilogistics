import '../design/components.dart';

/// One list row, composed by the server exactly as the web screen composes it.
///
/// The app used to build every row itself, out of the export's columns and a
/// guess per module in `spec.dart` — its own title, its own subtitle, its own
/// status word. So an indent on the phone read nothing like an indent on the
/// web: no approval chain, no fulfilment line, no "required by", and a status
/// spelled the way the database spells it.
///
/// Now the row arrives drawn: the title the card links, the muted line under
/// it in the web's own order, the labelled columns, the chain, the fulfilment
/// pill and the status badge with the web's own tone. Nothing here is decided
/// on the handset.
class ServerRow {
  const ServerRow({
    required this.id,
    required this.title,
    this.meta,
    this.chips = const [],
    this.lines = const [],
    this.chain = const [],
    this.pill,
    this.status,
    this.trailing,
    this.actions = const [],
    this.phone,
  });

  final String id;
  final String title;
  final String? meta;
  final List<RowChip> chips;
  final List<RowLine> lines;
  final List<ChainStep> chain;
  final RowPill? pill;
  final RowChip? status;
  final RowTrailing? trailing;

  /// The buttons the web's own row carries, decided by the server and sent in
  /// the same shape a record's actions arrive in — so the row runs them through
  /// the same confirmation sheet, collects the same fields, and shows the same
  /// refusal. The app never decides which of these a row gets.
  final List<Map<String, dynamic>> actions;

  /// Somebody to ring, where the server sent a number this viewer may see.
  /// The web has no such button — a desk cannot ring anyone.
  final String? phone;

  /// A row the list did not compose — a report's row, read off its columns the
  /// way the web's own report table reads it: the first column is the heading,
  /// the rest are labelled lines.
  static ServerRow fromColumns(
    List<Map<String, dynamic>> columns,
    Map<String, dynamic> row,
  ) {
    final cells = [
      for (final c in columns)
        (
          label: '${c["header"] ?? c["key"] ?? ""}',
          value: row['${c["key"]}'] == null ? '' : '${row["${c["key"]}"]}',
        ),
    ].where((c) => c.value.isNotEmpty).toList();
    return ServerRow(
      id: '${row["id"] ?? ""}',
      title: cells.isEmpty ? '—' : cells.first.value,
      lines: [
        for (final c in cells.skip(1)) RowLine(label: c.label, value: c.value),
      ],
    );
  }

  static ServerRow from(Map<String, dynamic> d) => ServerRow(
        id: '${d["id"] ?? ""}',
        phone: (d['contact'] as Map?)?['phone'] as String?,
        title: (d['title'] as String?) ?? '',
        meta: d['meta'] as String?,
        chips: ((d['chips'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(RowChip.from)
            .toList(),
        lines: ((d['lines'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((l) => RowLine(label: l['label'] as String?, value: '${l["value"] ?? ""}'))
            .toList(),
        chain: ((d['chain'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((c) => ChainStep(
                  '${c["short"] ?? ""}',
                  switch (c['state']) {
                    'done' => ChainState.done,
                    'now' => ChainState.current,
                    _ => ChainState.pending,
                  },
                ))
            .toList(),
        pill: d['pill'] == null
            ? null
            : RowPill.from((d['pill'] as Map).cast<String, dynamic>()),
        status: d['status'] == null
            ? null
            : RowChip.from((d['status'] as Map).cast<String, dynamic>()),
        trailing: d['trailing'] == null
            ? null
            : RowTrailing(
                value: '${(d["trailing"] as Map)["value"] ?? ""}',
                label: (d['trailing'] as Map)['label'] as String?,
              ),
        actions: ((d['actions'] as List?) ?? const []).cast<Map<String, dynamic>>(),
      );
}

class RowChip {
  const RowChip(this.text, this.tone);
  final String text;
  final Tone tone;

  static RowChip from(Map<String, dynamic> d) =>
      RowChip('${d["text"] ?? d["label"] ?? ""}', toneFrom(d['tone'] as String?));
}

class RowLine {
  const RowLine({this.label, required this.value});
  final String? label;
  final String value;
}

class RowPill {
  const RowPill({required this.label, required this.tone, this.text});
  final String label;
  final Tone tone;

  /// The sentence the web writes under the pill — what will actually happen.
  final String? text;

  static RowPill from(Map<String, dynamic> d) => RowPill(
        label: '${d["label"] ?? ""}',
        tone: toneFrom(d['tone'] as String?),
        text: d['text'] as String?,
      );
}

class RowTrailing {
  const RowTrailing({required this.value, this.label});
  final String value;
  final String? label;
}

/// The band, the empty state and the note — the screen around the rows.
class ScreenShell {
  const ScreenShell({
    required this.rows,
    this.band = const [],
    this.emptyTitle,
    this.emptyDetail,
    this.note,
    this.tabs,
  });

  final List<ServerRow> rows;
  final List<Figure> band;
  final String? emptyTitle;
  final String? emptyDetail;
  final String? note;

  /// The web's board columns, where a phone shows them one at a time: the
  /// lead pipeline is six columns on a desk and six tabs here.
  final ScreenTabsDef? tabs;

  static ScreenShell? from(Object? raw) {
    if (raw is! Map) return null;
    final d = raw.cast<String, dynamic>();
    final empty = d['empty'] as Map?;
    return ScreenShell(
      rows: ((d['rows'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(ServerRow.from)
          .toList(),
      band: ((d['band'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map((f) => Figure('${f["value"] ?? ""}', '${f["label"] ?? ""}',
              tone: f['tone'] == null ? null : toneFrom(f['tone'] as String?)))
          .toList(),
      emptyTitle: empty?['title'] as String?,
      emptyDetail: empty?['description'] as String?,
      note: d['note'] as String?,
      tabs: ScreenTabsDef.from(d['tabs']),
    );
  }
}

/// The tabs a list is split into, and the query key they set.
///
/// The app does not know what a pipeline is: it draws what it was sent and
/// sends the chosen key back under the name it was given.
class ScreenTabsDef {
  const ScreenTabsDef({required this.param, required this.options});

  final String param;
  final List<({String key, String label, int count})> options;

  static ScreenTabsDef? from(Object? raw) {
    if (raw is! Map) return null;
    final d = raw.cast<String, dynamic>();
    final options = ((d['options'] as List?) ?? const []).cast<Map<String, dynamic>>();
    if (options.isEmpty) return null;
    return ScreenTabsDef(
      param: '${d["param"] ?? ""}',
      options: [
        for (final o in options)
          (
            key: '${o["key"] ?? ""}',
            label: '${o["label"] ?? ""}',
            count: (o['count'] as num?)?.toInt() ?? 0,
          ),
      ],
    );
  }
}

/// The server's tone words, which are the web's own.
Tone toneFrom(String? t) => switch (t) {
      'good' => Tone.good,
      'warn' => Tone.warn,
      'bad' => Tone.bad,
      'plum' => Tone.plum,
      'info' => Tone.info,
      _ => Tone.draft,
    };

