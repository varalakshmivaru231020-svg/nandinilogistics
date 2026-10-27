import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import 'api.dart';
import 'pick_file.dart';
import 'where.dart';

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
    this.showWhen,
    this.prefixes,
    this.accept,
    this.maxFiles,
    this.camera,
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

  /// What this field becomes while another is ticked: the a date that
  /// becomes a day rather than an instant once "All day" is ticked.
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

  /// Shown only once this other field has a value, as the web reveals its
  /// its dependent fields only once the field it follows has a value.
  final String? showWhen;

  /// This field's value is prefixed onto another and not sent by itself — the
  /// country code beside a mobile number, which the web joins and then drops.
  final String? prefixes;

  /// For `files`: what the web's own input accepts. A field that takes images
  /// is offered the camera as well as the file chooser — a document is
  /// photographed where it is.
  final String? accept;

  /// For `files`: at most this many. A photograph is one, and choosing
  /// another replaces it, as the web's single file input does.
  final int? maxFiles;

  /// Whether the camera is offered beside the chooser, said outright by the
  /// server where the web's control invites a photograph of any type.
  final bool? camera;

  /// Whether a picture taken now belongs here.
  ///
  /// Only where the web's own control asks for one: a rider's photo and
  /// identity documents do, and a general attachment box does not get a camera
  /// it never had.
  bool get takesPhotos => camera ?? (accept?.contains('image/') ?? false);

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
      showWhen: j['showWhen'] as String?,
      prefixes: j['prefixes'] as String?,
      accept: j['accept'] as String?,
      maxFiles: (j['maxFiles'] as num?)?.toInt(),
      camera: j['camera'] as bool?,
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
    this.opensModule,
    this.opensIdField,
  });

  final String key;
  final String title;
  final String? description;
  final String submitLabel;
  final String action;
  final List<FieldDef> fields;

  /// "formData" — one object of every field; "positional" — `order` names them;
  /// "openRecord" — nothing is called, the form opens a record instead.
  final String shape;
  final List<Object?> order;
  final String? done;

  /// Where the shape is `openRecord`: the module to open, and the field
  /// holding the id. The web's goods receipt works this way — pick the
  /// approved order, then enter what arrived against its lines, because the
  /// lines cannot be drawn until the order is known.
  final String? opensModule;
  final String? opensIdField;

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
      opensModule: shape['module'] as String?,
      opensIdField: shape['id'] as String?,
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

  /// The files chosen for each `files` field, which travel as multipart under
  /// that field's own name — the name the action reads them under.
  final Map<String, List<Upload>> files = {};

  /// Every chosen file, flattened, for the one request that carries them.
  List<Upload> get uploads => [for (final list in files.values) ...list];

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

  /// One field's value as the string it will travel as. Used by a form whose
  /// only job is to open a record.
  String text(String name) {
    final f = fields.where((x) => x.name == name).firstOrNull;
    if (f == null) return '';
    if (f.isText) return controller(name).text.trim();
    return '${values[name] ?? ""}';
  }

  Object? read(FieldDef f) {
    // Not submitted: the stored value stands, as a disabled input does.
    if (f.locked) return null;
    // Joined onto another field and never sent by itself.
    if (f.prefixes != null) return null;
    // Files do not travel in the body: they are parts of the request.
    if (f.kind == 'files') return (files[f.name] ?? const []).isEmpty ? null : 'attached';
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
      // The field it leads with goes first.
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
      /*
       * Where the thing is: one field on screen, the two names the action
       * reads — which is exactly what the web posts from its own geolocation.
       */
      if (f.kind == 'geo') {
        final at = values[f.name] as Map<String, Object?>?;
        if (at != null) {
          out['latitude'] = at['latitude'];
          out['longitude'] = at['longitude'];
        }
        continue;
      }
      /*
       * The files themselves travel as parts of the same request, under this
       * field's own name — so the field contributes nothing to the values. It
       * used to send `read()`'s sentinel, which arrived as a text field called
       * "files" beside the real ones.
       */
      if (f.kind == 'files') continue;
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

    /*
     * The country code beside a mobile number. The web joins the two and posts
     * one value, prefixing only a number that does not already carry a code.
     */
    for (final f in fields) {
      final onto = f.prefixes;
      if (onto == null) continue;
      final code = '${values[f.name] ?? f.initial ?? ""}'.split(' ').first;
      final typed = '${out[onto] ?? ""}'.trim();
      if (code.isEmpty || typed.isEmpty || typed.startsWith('+')) continue;
      out[onto] = '$code $typed';
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
Object? fill(Object? slot, FormValues v, {String? recordId, Map<String, Object?> also = const {}}) {
  if (slot is Map) {
    return slot.map((k, inner) =>
        MapEntry('$k', fill(inner as Object?, v, recordId: recordId, also: also)));
  }
  if (slot is List) {
    return slot.map((inner) => fill(inner as Object?, v, recordId: recordId, also: also)).toList();
  }
  if (slot is! String || !slot.startsWith(r'$')) return slot;

  final name = slot.substring(1);
  /*
   * The whole body. An action called from a record gets the decision it stands
   * for and the remark that was typed as well as the fields — one body, as the
   * web posts one.
   */
  if (name == 'values') return {...v.asMap(), ...also};
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

  /// Whether a field that waits on another is due yet. The web reveals review
  /// dependent fields only once the field it follows has a value.
  bool _due(FieldDef f) {
    final on = f.showWhen;
    if (on == null) return true;
    final value = v.values[on];
    if (value is List) return value.isNotEmpty;
    if (value is String) return value.trim().isNotEmpty;
    if (value == null) {
      final text = v.fields.any((x) => x.name == on && x.isText);
      return text && v.controller(on).text.trim().isNotEmpty;
    }
    return value != false;
  }

  @override
  Widget build(BuildContext context) {
    final drawn = v.fields.where((f) => !f.hidden && _due(f)).toList();
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
      'files' => _Files(
          field: f,
          // Without the note: the chooser prints the web's small print under
          // itself, where the web prints it, and it was reading twice.
          label: _labelled(f, label, withNote: false),
          chosen: into.files[f.name] ?? const [],
          enabled: enabled,
          onChanged: (list) => setState(() => into.files[f.name] = list),
        ),
      'geo' => _Geo(
          field: f,
          label: _labelled(f, label),
          value: into.values[f.name] as Map<String, Object?>?,
          enabled: enabled,
          onChanged: (at) => setState(() => into.values[f.name] = at),
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
  String _labelled(FieldDef f, String label, {bool withNote = true}) {
    final bits = [
      label + (f.required ? ' *' : ''),
      if (f.locked) '· fixed',
      if (withNote && f.note != null) '· ${f.note}',
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
    /*
     * The design draws a short list of choices as chips — three priorities, two
     * marks — and anything longer as a searchable picker. Both are searchable:
     * the chips carry a Search chip beside them, so every dropdown in the app
     * can be found by typing rather than by scrolling.
     */
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
          // Searchable, like every other dropdown.
          if (field.options.length > 3)
            FilterChip2(
              key: Key('search-${field.name}'),
              label: 'Search…',
              onTap: enabled
                  ? () async {
                      final picked = await _search(
                        context,
                        field,
                        field.options,
                        clear: !field.required && value != null
                            ? (field.emptyLabel ?? 'None')
                            : null,
                      );
                      if (picked != null) onChanged(picked.isEmpty ? null : picked);
                    }
                  : null,
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

/// The files a form attaches — the web's own `<input type="file" multiple>`.
///
/// The boundary has always accepted multipart; what was missing was a way to
/// choose a file at all. Each one travels under this field's name, so the
/// action reads them exactly as it reads the browser's.
class _Files extends StatefulWidget {
  const _Files({
    required this.field,
    required this.label,
    required this.chosen,
    required this.enabled,
    required this.onChanged,
  });

  final FieldDef field;
  final String label;
  final List<Upload> chosen;
  final bool enabled;
  final ValueChanged<List<Upload>> onChanged;

  @override
  State<_Files> createState() => _FilesState();
}

class _FilesState extends State<_Files> {
  bool _busy = false;

  Future<void> _take(Future<List<Upload>> Function() from) async {
    setState(() => _busy = true);
    final picked = await from();
    if (!mounted) return;
    setState(() => _busy = false);
    if (picked.isEmpty) return;
    // At the cap — one, for a photograph — the new file replaces what was
    // held rather than piling up beside it.
    final cap = widget.field.maxFiles;
    final all = [...widget.chosen, ...picked];
    widget.onChanged(cap == null || all.length <= cap ? all : all.sublist(all.length - cap));
  }

  Future<void> _pick() => _take(() => Files.live.pick(widget.field.name));
  Future<void> _camera() => _take(() => Files.live.photo(widget.field.name));

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(widget.label, style: T.caption()),
      if (widget.field.note != null) ...[
        const SizedBox(height: 2),
        Text(widget.field.note!,
            style: T.caption(color: T.disabledInk).copyWith(fontWeight: FontWeight.w500)),
      ],
      const SizedBox(height: 6),
      if (widget.chosen.isNotEmpty) ...[
        Wrap(spacing: 7, runSpacing: 7, children: [
          for (final f in widget.chosen)
            FilterChip2(
              label: '${f.name} · ${(f.bytes.length / 1024).round()} KB',
              onRemove: widget.enabled
                  ? () => widget.onChanged(
                        widget.chosen.where((x) => x != f).toList(),
                      )
                  : null,
            ),
        ]),
        const SizedBox(height: 8),
      ],
      /*
       * Two ways in where the field takes pictures, because in the field the
       * photograph does not exist yet: the camera takes it, the chooser finds
       * one already taken. The web's single file input is both of these on a
       * desktop and neither on a phone.
       */
      if (widget.field.takesPhotos)
        Row(children: [
          Expanded(
            child: Btn(
              'Take a photo',
              key: Key('camera-${widget.field.name}'),
              emphasis: Emphasis.outline,
              icon: Icons.photo_camera_rounded,
              busy: _busy,
              expand: true,
              onPressed: widget.enabled ? _camera : null,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Btn(
              'Choose a file',
              key: Key('files-${widget.field.name}'),
              emphasis: Emphasis.outline,
              icon: Icons.attach_file_rounded,
              busy: _busy,
              expand: true,
              onPressed: widget.enabled ? _pick : null,
            ),
          ),
        ])
      else
        Btn(
          widget.chosen.isEmpty
              ? '+ Add file'
              : (widget.field.maxFiles == 1 ? '+ Replace file' : '+ Add another file'),
          key: Key('files-${widget.field.name}'),
          emphasis: Emphasis.outline,
          icon: Icons.attach_file_rounded,
          busy: _busy,
          expand: true,
          onPressed: widget.enabled ? _pick : null,
        ),
      if (widget.field.hint != null) ...[
        const SizedBox(height: 5),
        Text(widget.field.hint!, style: T.caption().copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }
}

/// Where this is, taken from the phone.
///
/// The web fills two hidden inputs from the browser's geolocation
/// and saves the log either way if it cannot. So does this: the button asks,
/// the coordinates show once they are known, and a refusal is said plainly
/// rather than blocking the form.
class _Geo extends StatefulWidget {
  const _Geo({
    required this.field,
    required this.label,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final FieldDef field;
  final String label;
  final Map<String, Object?>? value;
  final bool enabled;
  final ValueChanged<Map<String, Object?>?> onChanged;

  @override
  State<_Geo> createState() => _GeoState();
}

class _GeoState extends State<_Geo> {
  bool _busy = false;
  String? _problem;

  Future<void> _take() async {
    setState(() {
      _busy = true;
      _problem = null;
    });
    final at = await Where.live.position();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _problem = at == null ? (Where.live.problem ?? 'The position could not be read.') : null;
    });
    widget.onChanged(at == null ? null : {'latitude': at.lat, 'longitude': at.lng});
  }

  @override
  Widget build(BuildContext context) {
    final at = widget.value;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(widget.label, style: T.caption()),
      if (widget.field.note != null) ...[
        const SizedBox(height: 2),
        Text(widget.field.note!,
            style: T.caption(color: T.disabledInk).copyWith(fontWeight: FontWeight.w500)),
      ],
      const SizedBox(height: 6),
      Btn(
        at == null
            ? 'Use my location'
            : '${(at["latitude"] as num).toStringAsFixed(5)}, '
                '${(at["longitude"] as num).toStringAsFixed(5)}',
        key: Key('geo-${widget.field.name}'),
        emphasis: Emphasis.outline,
        icon: Icons.my_location_rounded,
        busy: _busy,
        expand: true,
        onPressed: widget.enabled ? _take : null,
      ),
      if (_problem != null) ...[
        const SizedBox(height: 5),
        Text(_problem!, style: T.caption(color: T.badInk).copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }
}

/// The lines of a document — a document's line items.
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
