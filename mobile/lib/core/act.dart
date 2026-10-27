import 'package:flutter/material.dart';

import '../design/components.dart';
import '../design/tokens.dart';
import 'api.dart';
import 'form.dart';

/// Running one of the web's actions, with the confirmation the design asks for.
///
/// Every mutating thing in this app goes through here, so that four things are
/// true everywhere without each screen remembering them:
///
///   - the person is told what the action will do **before** it runs, in a
///     sheet that names the consequence rather than asking "are you sure";
///   - a remark is collected where the action takes one, and required where
///     the server requires it;
///   - the server's refusal is shown in the server's own words — it names the
///     permission or the state, and rewording it loses that;
///   - the button cannot be pressed twice.
class Act {
  const Act({
    required this.action,
    required this.args,
    required this.label,
    required this.title,
    this.explain,
    this.emphasis = Emphasis.primary,
    this.remark = RemarkMode.none,
    this.remarkLabel = 'Remark',
    this.remarkPlaceholder,
    this.remarkField,
    this.parts = const {},
    this.fields = const [],
    this.done,
  });

  /// A key into the boundary's action registry, e.g.
  /// "advances/approveAdvance". The server tells us this; the app does
  /// not map a record kind to an action itself.
  final String action;

  /// The leading positional arguments. An argument of the form `$name` is
  /// replaced by the field of that name in [fields] — rejecting an onboarding
  /// task needs a new finish as well as a reason, and the web asks for both in
  /// one dialog.
  ///
  /// A remark is appended as the last argument, which is how most of these
  /// actions take one — unless an argument is `$values`, the whole body of a
  /// form, and then it goes inside that instead, under [remarkField]. The
  /// difference is the action's, not a choice: one takes `(id, remark)` and the
  /// other `(id, formData)`, and giving the second a third argument is refused
  /// by the boundary.
  final List<Object?> args;

  final String label;
  final String title;
  final String? explain;
  final Emphasis emphasis;
  final RemarkMode remark;
  final String remarkLabel;

  /// The web's own placeholder in the remark box — "What is wrong with it?
  /// (optional)" on a denial.
  final String? remarkPlaceholder;

  /// Where the remark goes when this action takes a form rather than a
  /// positional remark: a field of the body, named by the server.
  final String? remarkField;

  /// Values the body carries whatever the person types — the decision that
  /// tells Approve from Deny, which are otherwise the same call.
  final Map<String, String> parts;

  /// What else the sheet collects before the remark, as the server described it.
  final List<FieldDef> fields;

  /// What to say afterwards. Defaults to the label in the past tense, which is
  /// rarely good enough — pass the document number.
  final String? done;
}

enum RemarkMode { none, optional, required }

/// The emphasis the server asked for, in the design's own words.
Emphasis emphasisOf(String raw) => switch (raw) {
      'approve' => Emphasis.approve,
      'reject' => Emphasis.reject,
      'outline' => Emphasis.outline,
      _ => Emphasis.primary,
    };

/// Runs an action **exactly as the server described it**, whether it came from
/// a record or from a list row.
///
/// One path for both, because the web's row buttons and its detail buttons call
/// the same actions: an action carrying a `form` opens that form, anything else
/// goes through the confirmation sheet, which collects the remark and whatever
/// fields the action needs. Returns true when the server said it worked, so the
/// caller can refresh.
Future<bool> runServerAction(
  BuildContext context,
  Api api,
  Map<String, dynamic> a, {
  /// The record the action is about, for a form that wants its id.
  String? recordId,
  /// Pushes the form, where the action opens one. Left out, a form action is
  /// refused rather than silently doing nothing.
  Future<bool> Function(String formKey)? openForm,
}) async {
  final form = a['form'] as String?;
  if (form != null && form.isNotEmpty) {
    if (openForm == null) return false;
    return openForm(form);
  }

  return confirmAndRun(
    context,
    api,
    Act(
      action: '${a["action"]}',
      args: ((a['args'] as List?) ?? const []).cast<Object?>(),
      label: '${a["label"]}',
      title: '${a["label"]}',
      explain: a['confirm'] as String?,
      emphasis: emphasisOf('${a["emphasis"]}'),
      remark: switch (a['remark']) {
        'required' => RemarkMode.required,
        'optional' => RemarkMode.optional,
        _ => RemarkMode.none,
      },
      remarkLabel: (a['remarkLabel'] as String?) ?? 'Remark',
      remarkPlaceholder: a['remarkPlaceholder'] as String?,
      remarkField: a['remarkField'] as String?,
      parts: ((a['parts'] as Map?) ?? const {})
          .map((k, v) => MapEntry('$k', '$v')),
      // Where the action needs more than a remark — a new finish date, the
      // lines that arrived — the server sends the fields and the sheet
      // collects them.
      fields: ((a['fields'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(FieldDef.from)
          .toList(),
      done: '${a["label"]} — done.',
    ),
  );
}

/// Puts the confirmation up, runs the action, and reports.
///
/// Returns true only if the server said it worked, so a caller can refresh.
Future<bool> confirmAndRun(
  BuildContext context,
  Api api,
  Act act, {
  String? ceiling,
}) async {
  final messenger = ScaffoldMessenger.of(context);

  final ran = await sheet<bool>(
    context,
    title: act.title,
    explain: act.explain,
    // The sheet owns the remark field. Holding it out here and disposing it
    // when the sheet returned used it after disposal — the sheet is still
    // building while it animates away.
    body: (ctx) => _Confirm(api: api, act: act, ceiling: ceiling),
  );

  if (ran != true) return false;

  messenger.showSnackBar(SnackBar(
    backgroundColor: T.navy950,
    behavior: SnackBarBehavior.floating,
    margin: const EdgeInsets.all(T.gutter),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    content: Text(act.done ?? '${act.label} — done.',
        style: T.body(color: Colors.white, weight: FontWeight.w500).copyWith(fontSize: 13.5)),
  ));
  return true;
}

class _Confirm extends StatefulWidget {
  const _Confirm({required this.api, required this.act, this.ceiling});

  final Api api;
  final Act act;
  final String? ceiling;

  @override
  State<_Confirm> createState() => _ConfirmState();
}

class _ConfirmState extends State<_Confirm> {
  final _remark = TextEditingController();
  late final FormValues _extra = FormValues(widget.act.fields);
  bool _busy = false;
  String? _error;
  String? _errorDetail;

  @override
  void dispose() {
    _remark.dispose();
    _extra.dispose();
    super.dispose();
  }

  /// Whether one of the arguments is the form body itself.
  bool get _takesBody => widget.act.args.any((a) => a == r'$values');

  bool get _remarkMissing =>
      widget.act.remark == RemarkMode.required && _remark.text.trim().isEmpty;

  Future<void> _go() async {
    final missing = _extra.problem();
    if (missing != null) {
      setState(() => _error = missing);
      return;
    }
    if (_remarkMissing) {
      setState(() => _error = 'A remark is required for this.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _errorDetail = null;
    });

    // `$name` stands for one of the fields the sheet just collected, wherever
    // it appears — including inside an object the action takes whole.
    final remark = _remark.text.trim();
    final body = {
      ...widget.act.parts,
      if (widget.act.remark != RemarkMode.none && remark.isNotEmpty)
        (widget.act.remarkField ?? 'remark'): remark,
    };
    final args = widget.act.args.map((a) => fill(a, _extra, also: body)).toList();
    // Only where the action takes the remark on its own, as its own argument.
    if (widget.act.remark != RemarkMode.none && !_takesBody) args.add(remark);

    final res = await widget.api.run(widget.act.action, args, files: _extra.uploads);
    if (!mounted) return;

    if (res.ok) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      // The server's sentence, verbatim. It names the permission or the state
      // that stopped this, and wording it ourselves would lose that.
      _error = res.error;
      _errorDetail = res.code == null ? null : 'Refused by ${res.code}';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.ceiling != null) ...[
        Alert(widget.ceiling!, tone: Tone.info),
        const SizedBox(height: 12),
      ],
      if (widget.act.fields.isNotEmpty) FormBody(values: _extra, enabled: !_busy, compact: true),
      if (widget.act.remark != RemarkMode.none) ...[
        Field(
          fieldKey: const Key('remark'),
          label: widget.act.remark == RemarkMode.required
              ? widget.act.remarkLabel
              : '${widget.act.remarkLabel} · optional',
          // `hint` is the grey text inside the box — the web's placeholder.
          hint: widget.act.remarkPlaceholder,
          controller: _remark,
          lines: 2,
          enabled: !_busy,
          onSubmit: _go,
        ),
        const SizedBox(height: 12),
      ],
      if (_error != null) ...[
        Alert(_error!, detail: _errorDetail),
        const SizedBox(height: 12),
      ],
      Row(children: [
        Expanded(
          child: Btn('Cancel',
              emphasis: Emphasis.outline,
              height: 50,
              expand: true,
              onPressed: _busy ? null : () => Navigator.of(context).pop(false)),
        ),
        const SizedBox(width: 9),
        Expanded(
          flex: 2,
          child: Btn(widget.act.label,
              key: const Key('confirm'),
              emphasis: widget.act.emphasis,
              height: 50,
              expand: true,
              busy: _busy,
              onPressed: _go),
        ),
      ]),
    ]);
  }
}
