import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/components.dart';
import '../design/tokens.dart';

/// Forms, as the server describes them.
///
/// The app could read every list and open every record but could not **make**
/// anything, because a create screen is neither of those: it is a set of
/// fields, and the app had no idea what any module's fields were. Rather than
/// write thirty forms into the app — which is how the filters came to be wrong
/// in thirty different ways — the boundary sends each one: the labels, the
/// hints, the placeholders, the option lists and the name of the action to
/// call. What is drawn here is the web's own form.

/// One option in a dropdown, with the second line the web shows under it.
class Opt {
  const Opt(this.value, this.label, [this.hint]);
  final String value;
  final String label;
  final String? hint;

  static List<Opt> list(Object? raw) => ((raw as List?) ?? const [])
      .cast<Map<String, dynamic>>()
      .map((o) => Opt('${o["value"]}', '${o["label"]}', o['hint'] as String?))
      .toList();
}

class FieldDef {
  FieldDef({
    required this.name,
    required this.label,
    required this.kind,
    this.required = false,
    this.hint,
    this.note,
    this.placeholder,
    this.options = const [],
    this.caps = false,
    this.emptyLabel,
    this.locked = false,
    this.wide = false,
    this.initial,
    this.variantWhen,
    this.variantLabel,
    this.variantKind,
    this.row = const [],
    this.addLabel,
    this.initialRows = const [],
    this.fixedRows = false,
    this.hidden = false,
    this.minRows = 0,
    this.minRowsMessage,
    this.leadWith,
  });

  final String name;
  final String label;
  final String kind;
  final bool required;
  final String? hint;

  /// The web's small print beside a label — "they accept before it is theirs".
  final String? note;

  final String? placeholder;
  final List<Opt> options;
  final bool caps;

  /// What the web calls the nothing-chosen option — "None", "Select…".
  final String? emptyLabel;

  final bool wide;
  final Object? initial;

  /// What this field becomes while another is ticked: the calendar's "Starts"
  /// is "First day" once "Runs all day" is on, and takes a day, not an instant.
  final String? variantWhen;
  final String? variantLabel;
  final String? variantKind;

  /// For `rows`: the fields of one line.
  final List<FieldDef> row;
  final String? addLabel;

  /// For `rows`: the lines that are already there, each a map of field name to
  /// its starting value. `_label` names the line.
  final List<Map<String, Object?>> initialRows;

  /// For `rows`: the lines are fixed — none may be added or removed.
  final bool fixedRows;

  /// Carried and submitted, never drawn.
  final bool hidden;

  /// Shown as it stands and not editable — a booked lead's name, an identity
  /// number this person may not see. The web disables the input; a disabled
  /// input is not submitted, so the stored value stands either way.
  final bool locked;
  final int minRows;
  final String? minRowsMessage;

  /// For `multi`: the field whose value is sent first in the list.
  final String? leadWith;

  factory FieldDef.from(Map<String, dynamic> j) {
    final v = j['variant'] as Map<String, dynamic>?;
    return FieldDef(
      name: '${j["name"]}',
      label: '${j["label"]}',
      kind: '${j["kind"]}',
      required: j['required'] == true,
      hint: j['hint'] as String?,
      note: j['note'] as String?,
      placeholder: j['placeholder'] as String?,
      options: Opt.list(j['options']),
      caps: j['caps'] == true,
      emptyLabel: j['emptyLabel'] as String?,
      wide: j['wide'] == true,
      initial: j['initial'],
      variantWhen: v?['whenField'] as String?,
      variantLabel: v?['label'] as String?,
      variantKind: v?['kind'] as String?,
      row: ((j['row'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(FieldDef.from)
          .toList(),
      addLabel: j['addLabel'] as String?,
      initialRows: ((j['initialRows'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map((r) => r.map((k, v) => MapEntry(k, v as Object?)))
          .toList(),
      fixedRows: j['fixedRows'] == true,
      hidden: j['hidden'] == true,
      locked: j['locked'] == true,
      minRows: (j['minRows'] as num?)?.toInt() ?? 0,
      minRowsMessage: j['minRowsMessage'] as String?,
      leadWith: j['leadWith'] as String?,
    );
  }

  bool get isText => const {
        'text', 'textarea', 'number', 'money', 'phone', 'email', 'suggest',
      }.contains(kind);
}

class FormDef {
  FormDef({
    required this.key,
    required this.title,
    required this.submitLabel,
    required this.action,
    required this.fields,
    this.description,
    this.shape = 'formData',
    this.order = const [],
    this.done,
  });

  final String key;
  final String title;
  final String? description;
  final String submitLabel;
  final String action;
  final List<FieldDef> fields;

  /// "formData" — one object of every field; "positional" — `order` names them.
  final String shape;
  final List<Object?> order;
  final String? done;

  factory FormDef.from(Map<String, dynamic> j) {
    final shape = (j['shape'] as Map<String, dynamic>?) ?? const {'kind': 'formData'};
    return FormDef(
      key: '${j["key"]}',
      title: '${j["title"]}',
      description: j['description'] as String?,
      submitLabel: '${j["submitLabel"]}',
      action: '${j["action"]}',
      shape: '${shape["kind"]}',
      order: (shape['order'] as List?)?.cast<Object?>() ?? const [],
      done: j['done'] as String?,
      fields: ((j['fields'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(FieldDef.from)
          .toList(),
    );
  }
}

/* -------------------------------------------------------------- the values */

/// What has been typed so far, and the controllers behind the text fields.
///
/// Held apart from the widget so that the confirmation sheet and the full-page
/// form can share one set of controls.
class FormValues {
  FormValues(this.fields, {Map<String, Object?> seed = const {}}) {
    label = seed['_label'] as String?;
    for (final f in fields) {
      final start = seed.containsKey(f.name) ? seed[f.name] : f.initial;
      if (f.isText) {
        _text[f.name] = TextEditingController(text: start?.toString() ?? '');
      } else if (f.kind == 'checkbox') {
        values[f.name] = start == true;
      } else if (f.kind == 'multi') {
        values[f.name] = start == null || '$start'.isEmpty
            ? <String>[]
            : '$start'.split(',').where((p) => p.isNotEmpty).toList();
      } else if (f.kind == 'rows') {
        rows[f.name] = f.initialRows.isNotEmpty
            ? f.initialRows.map((seed) => FormValues(f.row, seed: seed)).toList()
            : [for (var i = 0; i < (f.minRows > 0 ? 1 : 0); i++) FormValues(f.row)];
      } else if (start != null) {
        values[f.name] = start;
      }
    }
  }

  final List<FieldDef> fields;

  /// What this line is called, where it came with a name of its own.
  String? label;

  final Map<String, Object?> values = {};
  final Map<String, TextEditingController> _text = {};

  /// One `FormValues` per line of a `rows` field.
  final Map<String, List<FormValues>> rows = {};

  TextEditingController controller(String name) => _text[name]!;

  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    for (final list in rows.values) {
      for (final r in list) {
        r.dispose();
      }
    }
  }

  Object? read(FieldDef f) {
    // Not submitted: the stored value stands, as a disabled input does.
    if (f.locked) return null;
    if (f.isText) {
      final t = controller(f.name).text.trim();
      if (t.isEmpty) return null;
      if (f.kind == 'number' || f.kind == 'money') return num.tryParse(t) ?? t;
      return t;
    }
    if (f.kind == 'rows') {
      return (rows[f.name] ?? const []).map((r) => r.asMap()).toList();
    }
    if (f.kind == 'multi') {
      final picked = (values[f.name] as List?)?.cast<String>() ?? const <String>[];
      // An empty list, not nothing: an action that takes a list of ids takes
      // the empty one, and `toFormData` appends nothing for it.
      if (f.leadWith == null) return picked;
      // Review level 1 is the assignee, and the action reads the list in level
      // order — so whoever that field names goes first.
      final lead = values[f.leadWith!] ?? _text[f.leadWith!]?.text;
      return [
        if (lead != null && '$lead'.isNotEmpty) '$lead',
        ...picked.where((p) => p != '$lead'),
      ];
    }
    return values[f.name];
  }

  /// Every field, as the action's `FormData` or parsed input wants it.
  Map<String, Object?> asMap() {
    final out = <String, Object?>{};
    for (final f in fields) {
      final v = read(f);
      if (v == null) continue;
      // An empty list is nothing to send in a form body.
      if (v is List && v.isEmpty) continue;
      if (f.kind == 'checkbox') {
        // A browser sends a ticked box as "on" and leaves it out otherwise,
        // which is what every one of these actions reads.
        if (v == true) out[f.name] = 'on';
        continue;
      }
      out[f.name] = v;
    }
    return out;
  }

  /// The first thing missing, in the web's own words.
  String? problem() {
    for (final f in fields) {
      final v = read(f);
      if (f.required && (v == null || (v is List && v.isEmpty))) {
        return '${f.label} is required.';
      }
      if (f.kind == 'rows') {
        final lines = rows[f.name] ?? const <FormValues>[];
        if (lines.length < f.minRows) {
          return f.minRowsMessage ?? '${f.label} needs at least ${f.minRows}.';
        }
        for (final line in lines) {
          final p = line.problem();
          if (p != null) return p;
        }
      }
    }
    return null;
  }

  /// The arguments for the action, with `$name` standing for a field's value.
  List<Object?> args(FormDef def, {String? recordId}) {
    if (def.shape == 'formData') return [asMap()];
    return def.order.map((slot) => fill(slot, this, recordId: recordId)).toList();
  }
}

/* ----------------------------------------------------------- substitution */

/// One argument with its `$name` placeholders replaced by what was collected.
///
/// Walks objects and lists, because an action that takes a parsed input takes
/// one object — raising a return is `{issueId, reason, lines}` — and only some
/// of its keys come from the form.
Object? fill(Object? slot, FormValues v, {String? recordId}) {
  if (slot is Map) {
    return slot.map((k, inner) => MapEntry('$k', fill(inner as Object?, v, recordId: recordId)));
  }
  if (slot is List) {
    return slot.map((inner) => fill(inner as Object?, v, recordId: recordId)).toList();
  }
  if (slot is! String || !slot.startsWith(r'$')) return slot;

  final name = slot.substring(1);
  if (name == 'values') return v.asMap();
  if (name == 'id') return recordId;

  final f = v.fields.where((x) => x.name == name).firstOrNull;
  if (f == null) return slot;
  /*
   * One rule for an empty answer: a box or a chooser sends an empty string,
   * which is what a form sends, and the boundary turns that into nothing for
   * an argument whose action takes `| null`. A list sends the empty list.
   */
  return v.read(f) ?? (_sendsEmptyText(f.kind) ? '' : null);
}

/// The kinds whose empty answer is an empty string rather than nothing.
bool _sendsEmptyText(String kind) => const {
      'text', 'textarea', 'number', 'money', 'phone', 'email', 'suggest',
      'date', 'datetime', 'select', 'lookup',
    }.contains(kind);

/* -------------------------------------------------------------- the widgets */

/// The fields of a form, drawn in the design's own controls.
class FormBody extends StatefulWidget {
  const FormBody({super.key, required this.values, this.enabled = true, this.compact = false});

  final FormValues values;
  final bool enabled;

  /// Inside a confirmation sheet, where there is less room and no section gap.
  final bool compact;

  @override
  State<FormBody> createState() => _FormBodyState();
}

class _FormBodyState extends State<FormBody> {
  FormValues get v => widget.values;

  /// The label and kind this field has right now — "First day" and a date
  /// once "Runs all day" is ticked.
  (String, String) _shape(FieldDef f) {
    if (f.variantWhen != null && v.values[f.variantWhen!] == true) {
      return (f.variantLabel ?? f.label, f.variantKind ?? f.kind);
    }
    return (f.label, f.kind);
  }

  @override
  Widget build(BuildContext context) {
    final drawn = v.fields.where((f) => !f.hidden).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final f in drawn) ...[
        _control(f, v),
        SizedBox(height: widget.compact ? 12 : 14),
      ],
    ]);
  }

  Widget _control(FieldDef f, FormValues into) {
    final (label, kind) = _shape(f);
    final enabled = widget.enabled && !f.locked;

    if (f.isText) {
      final box = Field(
        fieldKey: Key('field-${f.name}'),
        label: _labelled(f, label),
        controller: into.controller(f.name),
        hint: f.placeholder,
        note: f.hint,
        enabled: enabled,
        lines: kind == 'textarea' ? 3 : 1,
        keyboard: switch (kind) {
          'number' || 'money' => const TextInputType.numberWithOptions(decimal: true),
          'phone' => TextInputType.phone,
          'email' => TextInputType.emailAddress,
          'textarea' => TextInputType.multiline,
          _ => TextInputType.text,
        },
        formatters: f.caps ? [UpperCaseFormatter()] : null,
      );

      // The web's datalist: typed, with the names it would suggest offered
      // underneath. Picking one fills the box; it is still free text.
      if (kind != 'suggest' || f.options.isEmpty) return box;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        box,
        const SizedBox(height: 7),
        Wrap(spacing: 7, runSpacing: 7, children: [
          for (final o in f.options.take(8))
            FilterChip2(
              label: o.label,
              selected: into.controller(f.name).text.trim().toLowerCase() ==
                  o.label.toLowerCase(),
              onTap: widget.enabled
                  ? () => setState(() => into.controller(f.name).text = o.label)
                  : null,
            ),
        ]),
      ]);
    }

    return switch (kind) {
      'checkbox' => _Check(
          label: label,
          value: into.values[f.name] == true,
          onChanged: enabled ? (b) => setState(() => into.values[f.name] = b) : null,
        ),
      'date' || 'datetime' => _DateField(
          label: _labelled(f, label),
          hint: f.hint,
          time: kind == 'datetime',
          value: into.values[f.name] as String?,
          initial: f.initial?.toString(),
          enabled: enabled,
          onChanged: (s) => setState(() => into.values[f.name] = s),
        ),
      'select' || 'lookup' => _PickOne(
          field: f,
          label: _labelled(f, label),
          value: into.values[f.name] as String?,
          enabled: enabled,
          onChanged: (s) => setState(() => into.values[f.name] = s),
        ),
      'multi' => _PickMany(
          field: f,
          label: _labelled(f, label),
          picked: ((into.values[f.name] as List?) ?? const []).cast<String>(),
          enabled: enabled,
          onChanged: (list) => setState(() => into.values[f.name] = list),
        ),
      'rows' => _Lines(
          field: f,
          lines: into.rows.putIfAbsent(f.name, () => []),
          enabled: enabled,
          onChanged: () => setState(() {}),
        ),
      _ => const SizedBox.shrink(),
    };
  }

  /// The label, with the web's required mark and its small print.
  String _labelled(FieldDef f, String label) {
    final bits = [
      label + (f.required ? ' *' : ''),
      if (f.locked) '· fixed',
      if (f.note != null) '· ${f.note}',
    ];
    return bits.join(' ');
  }
}

/// "Runs all day" — a box and a line of text, 48 high so it can be hit.
class _Check extends StatelessWidget {
  const _Check({required this.label, required this.value, this.onChanged});

  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(T.rControl),
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: SizedBox(
        height: T.target,
        child: Row(children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: value ? T.brand500 : T.card,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: value ? T.brand500 : T.line400, width: 1.4),
            ),
            child: value
                ? const Icon(Icons.check_rounded, size: 15, color: Colors.white)
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: T.body(weight: FontWeight.w600))),
        ]),
      ),
    );
  }
}

/// A day, or a day and a time.
class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.time,
    required this.value,
    required this.enabled,
    required this.onChanged,
    this.hint,
    this.initial,
  });

  final String label;
  final String? hint;
  final bool time;
  final String? value;
  final String? initial;
  final bool enabled;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final shown = value ?? initial;
    final when = shown == null ? null : DateTime.tryParse(shown)?.toLocal();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: T.caption()),
      const SizedBox(height: 6),
      Btn(
        when == null ? (time ? 'Pick a date and time' : 'Pick a date') : _show(when),
        emphasis: Emphasis.outline,
        icon: Icons.event_rounded,
        expand: true,
        onPressed: enabled ? () => _pick(context, when) : null,
      ),
      if (hint != null) ...[
        const SizedBox(height: 5),
        Text(hint!, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  String _show(DateTime d) => time
      ? '${shortDate(d.toIso8601String())}, ${_two(d.hour)}:${_two(d.minute)}'
      : shortDate(d.toIso8601String());

  Future<void> _pick(BuildContext context, DateTime? from) async {
    final now = DateTime.now();
    final day = await showDatePicker(
      context: context,
      initialDate: from ?? now,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 5),
    );
    if (day == null) return;

    if (!time) {
      onChanged('${day.year}-${_two(day.month)}-${_two(day.day)}');
      return;
    }
    if (!context.mounted) return;
    final at = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(from ?? now),
    );
    if (at == null) return;

    final local = DateTime(day.year, day.month, day.day, at.hour, at.minute);
    /*
     * Sent with the phone's offset on it, not as bare wall-clock text. The
     * server parses what it is given, and a server keeping UTC time would read
     * "10:00" as 10:00 UTC — half past three in the afternoon here. The offset
     * removes the question.
     */
    onChanged(_withOffset(local));
  }

  String _withOffset(DateTime local) {
    final off = local.timeZoneOffset;
    final sign = off.isNegative ? '-' : '+';
    final h = _two(off.inHours.abs());
    final m = _two(off.inMinutes.abs() % 60);
    return '${local.year}-${_two(local.month)}-${_two(local.day)}'
        'T${_two(local.hour)}:${_two(local.minute)}:00$sign$h:$m';
  }
}

/// One of a list. Chips while they fit, a searchable sheet when they do not.
class _PickOne extends StatelessWidget {
  const _PickOne({
    required this.field,
    required this.label,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final FieldDef field;
  final String label;
  final String? value;
  final bool enabled;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final chosen = field.options.where((o) => o.value == value).firstOrNull;
    final asChips = field.kind == 'select' && field.options.length <= 6;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: T.caption()),
      const SizedBox(height: 6),
      if (asChips)
        Wrap(spacing: 7, runSpacing: 7, children: [
          if (!field.required)
            FilterChip2(
              label: field.emptyLabel ?? 'None',
              selected: value == null,
              onTap: enabled ? () => onChanged(null) : null,
            ),
          for (final o in field.options)
            FilterChip2(
              label: o.label,
              selected: value == o.value,
              onTap: enabled ? () => onChanged(o.value) : null,
            ),
        ])
      else
        Btn(
          chosen?.label ?? field.emptyLabel ?? field.placeholder ?? 'Choose',
          emphasis: Emphasis.outline,
          icon: Icons.search_rounded,
          expand: true,
          onPressed: enabled
              ? () async {
                  final picked = await _search(
                    context,
                    field,
                    field.options,
                    // Something already chosen can be unchosen, where the
                    // field is not required.
                    clear: !field.required && value != null
                        ? (field.emptyLabel ?? 'None')
                        : null,
                  );
                  if (picked != null) onChanged(picked.isEmpty ? null : picked);
                }
              : null,
        ),
      if (field.hint != null) ...[
        const SizedBox(height: 5),
        Text(field.hint!, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
      ],
      if (field.options.isEmpty) ...[
        const SizedBox(height: 5),
        Text('Nothing to choose from yet.', style: T.caption().copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }
}

/// Several of a list, in the order they were added.
class _PickMany extends StatelessWidget {
  const _PickMany({
    required this.field,
    required this.label,
    required this.picked,
    required this.enabled,
    required this.onChanged,
  });

  final FieldDef field;
  final String label;
  final List<String> picked;
  final bool enabled;
  final ValueChanged<List<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    final free = field.options.where((o) => !picked.contains(o.value)).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: T.caption()),
      const SizedBox(height: 6),
      if (picked.isNotEmpty) ...[
        Wrap(spacing: 7, runSpacing: 7, children: [
          for (final id in picked)
            FilterChip2(
              label: field.options.where((o) => o.value == id).firstOrNull?.label ?? id,
              onRemove: enabled
                  ? () => onChanged(picked.where((p) => p != id).toList())
                  : null,
            ),
        ]),
        const SizedBox(height: 8),
      ],
      Btn(
        field.placeholder ?? 'Add',
        emphasis: Emphasis.outline,
        icon: Icons.person_add_alt_rounded,
        expand: true,
        onPressed: enabled && free.isNotEmpty
            ? () async {
                final one = await _search(context, field, free);
                if (one != null && one.isNotEmpty) onChanged([...picked, one]);
              }
            : null,
      ),
      if (field.note == null && field.hint != null) ...[
        const SizedBox(height: 5),
        Text(field.hint!, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }
}

/// The lines of a document — an indent's items.
class _Lines extends StatelessWidget {
  const _Lines({
    required this.field,
    required this.lines,
    required this.enabled,
    required this.onChanged,
  });

  final FieldDef field;
  final List<FormValues> lines;
  final bool enabled;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Overline(field.label),
      const SizedBox(height: 8),
      for (var i = 0; i < lines.length; i++) ...[
        Panel(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Overline(lines[i].label ?? 'Line ${i + 1}')),
              if (!field.fixedRows && lines.length > field.minRows)
                GestureDetector(
                  onTap: enabled
                      ? () {
                          lines.removeAt(i).dispose();
                          onChanged();
                        }
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8, bottom: 4),
                    child: Text('Remove', style: T.caption(color: T.badInk).copyWith(fontWeight: FontWeight.w500)),
                  ),
                ),
            ]),
            const SizedBox(height: 10),
            FormBody(values: lines[i], enabled: enabled, compact: true),
          ]),
        ),
        const SizedBox(height: 9),
      ],
      if (!field.fixedRows)
        Btn(
          field.addLabel ?? 'Add line',
          emphasis: Emphasis.outline,
          icon: Icons.add_rounded,
          expand: true,
          onPressed: enabled
              ? () {
                  lines.add(FormValues(field.row));
                  onChanged();
                }
              : null,
        ),
    ]);
  }
}

/// The searchable dropdown, as a sheet: a search box and the matches.
Future<String?> _search(
  BuildContext context,
  FieldDef field,
  List<Opt> options, {
  String? clear,
}) =>
    sheet<String>(
      context,
      title: field.label,
      body: (ctx) =>
          _SearchList(options: options, placeholder: field.placeholder, clear: clear),
    );

class _SearchList extends StatefulWidget {
  const _SearchList({required this.options, this.placeholder, this.clear});
  final List<Opt> options;
  final String? placeholder;

  /// Offered as the first row where what is chosen can be unchosen.
  final String? clear;

  @override
  State<_SearchList> createState() => _SearchListState();
}

class _SearchListState extends State<_SearchList> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _q.text.trim().toLowerCase();
    final shown = q.isEmpty
        ? widget.options
        : widget.options
            .where((o) =>
                o.label.toLowerCase().contains(q) ||
                (o.hint ?? '').toLowerCase().contains(q))
            .toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Field(
        fieldKey: const Key('search-options'),
        label: 'Search',
        controller: _q,
        hint: widget.placeholder,
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 10),
      if (widget.clear != null)
        InkWell(
          key: const Key('option-none'),
          onTap: () => Navigator.of(context).pop(''),
          child: Container(
            constraints: const BoxConstraints(minHeight: T.target),
            alignment: Alignment.centerLeft,
            child: Text(widget.clear!, style: T.body(weight: FontWeight.w600, color: T.secondary)),
          ),
        ),
      if (shown.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Text('Nothing matches “${_q.text.trim()}”.',
              style: T.secondaryText(), textAlign: TextAlign.center),
        ),
      for (final o in shown)
        InkWell(
          key: Key('option-${o.value}'),
          onTap: () => Navigator.of(context).pop(o.value),
          child: Container(
            constraints: const BoxConstraints(minHeight: T.target),
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(o.label, style: T.body(weight: FontWeight.w600)),
              if (o.hint != null && o.hint!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(o.hint!, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
              ],
            ]),
          ),
        ),
    ]);
  }
}

/// Upper-cases as it is typed, as the web's PAN field does.
class UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue next) =>
      next.copyWith(text: next.text.toUpperCase());
}
