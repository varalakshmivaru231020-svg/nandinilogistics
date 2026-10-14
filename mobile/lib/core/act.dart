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
    this.fields = const [],
    this.done,
  });

  /// A key into the boundary's action registry, e.g.
  /// "material/indents/approveIndent". The server tells us this; the app does
  /// not map a record kind to an action itself.
  final String action;

  /// The leading positional arguments. A remark, where one is collected, is
  /// appended to these. An argument of the form `$name` is replaced by the
  /// field of that name in [fields] — extending a calendar task needs a new
  /// finish as well as a reason, and the web asks for both in one dialog.
  final List<Object?> args;

  final String label;
  final String title;
  final String? explain;
  final Emphasis emphasis;
  final RemarkMode remark;
  final String remarkLabel;

  /// What else the sheet collects before the remark, as the server described it.
  final List<FieldDef> fields;

  /// What to say afterwards. Defaults to the label in the past tense, which is
  /// rarely good enough — pass the document number.
  final String? done;
}

enum RemarkMode { none, optional, required }

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
    final args = widget.act.args.map((a) => fill(a, _extra)).toList();
    if (widget.act.remark != RemarkMode.none) args.add(_remark.text.trim());

    final res = await widget.api.run(widget.act.action, args);
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
