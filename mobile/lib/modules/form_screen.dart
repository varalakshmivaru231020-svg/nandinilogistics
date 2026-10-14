import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/form.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Making something: the web's own form, on a phone.
///
/// The fields come from `/form/<module>/<name>` rather than from anything held
/// in the app, so what is asked for here is what the web modal asks for — the
/// same labels, the same hints, the same required marks — and submitting calls
/// the same server action, which authorizes again and validates again. A
/// refusal is shown in the server's own words.
class FormScreen extends StatefulWidget {
  const FormScreen({
    super.key,
    required this.api,
    required this.formKey,
    this.recordId,
  });

  final Api api;

  /// "calendar:create" — module, then what the form does.
  final String formKey;

  /// The record an edit form was opened on, for a `$id` argument.
  final String? recordId;

  @override
  State<FormScreen> createState() => _FormScreenState();
}

class _FormScreenState extends State<FormScreen> {
  FormDef? _def;
  FormValues? _values;
  String? _loadError;
  String? _loadCode;
  String? _error;
  String? _errorDetail;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _values?.dispose();
    super.dispose();
  }

  String get _path {
    final cut = widget.formKey.lastIndexOf(':');
    final module = widget.formKey.substring(0, cut);
    final name = widget.formKey.substring(cut + 1);
    return '/form/$module/$name';
  }

  Future<void> _load() async {
    setState(() {
      _loadError = null;
      _loadCode = null;
    });
    final res = await widget.api.get(_path);
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loadError = res.error;
        _loadCode = res.code;
      });
      return;
    }
    final def = FormDef.from(res.data as Map<String, dynamic>);
    setState(() {
      _def = def;
      _values?.dispose();
      _values = FormValues(def.fields);
    });
  }

  Future<void> _submit() async {
    final def = _def;
    final values = _values;
    if (def == null || values == null) return;

    final problem = values.problem();
    if (problem != null) {
      setState(() {
        _error = problem;
        _errorDetail = null;
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _errorDetail = null;
    });

    // Both taken before the await: the screen is gone by the time the message
    // is shown, so neither can be read off its context afterwards.
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    final res = await widget.api.run(def.action, values.args(def, recordId: widget.recordId));
    if (!mounted) return;

    if (res.ok) {
      navigator.pop(true);
      messenger.showSnackBar(SnackBar(
        backgroundColor: T.navy950,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(T.gutter),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        content: Text(def.done ?? '${def.title} — done.',
            style: T.body(color: Colors.white, weight: FontWeight.w500).copyWith(fontSize: 13.5)),
      ));
      return;
    }
    setState(() {
      _busy = false;
      // The server's sentence, which names the rule that stopped it.
      _error = res.error;
      _errorDetail = res.code == null ? null : 'Refused by ${res.code}';
    });
  }

  @override
  Widget build(BuildContext context) {
    final def = _def;

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: def?.title ?? 'New',
          subtitle: def?.description,
          onBack: () => Navigator.of(context).pop(false),
          titleStyle: T.barTitle().copyWith(fontSize: 17),
        ),
        Expanded(
          child: _loadError != null
          ? Padding(
              padding: const EdgeInsets.all(T.gutter),
              child: _loadCode == 'unknown-form'
                  ? Empty('Not on the phone yet',
                      detail: '$_loadError It can still be created on the web.')
                  : Column(children: [
                      Alert(_loadError!, detail: _loadCode == null ? null : 'Refused by $_loadCode'),
                      const SizedBox(height: 12),
                      if (_loadCode != 'forbidden')
                        Btn('Try again', emphasis: Emphasis.outline, onPressed: _load),
                    ]),
            )
          : def == null || _values == null
              ? const Center(child: CircularProgressIndicator(strokeWidth: 2.2))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 30),
                  children: [
                    if (_error != null) ...[
                      Alert(_error!, detail: _errorDetail),
                      const SizedBox(height: 14),
                    ],
                    Panel(
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 2),
                      child: FormBody(values: _values!, enabled: !_busy),
                    ),
                  ],
                ),
        ),
      ]),
      bottomNavigationBar: def == null
          ? null
          : ActionBar(children: [
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
                child: Btn(def.submitLabel,
                    key: const Key('submit'),
                    height: 50,
                    expand: true,
                    busy: _busy,
                    onPressed: _submit),
              ),
            ]),
    );
  }
}
