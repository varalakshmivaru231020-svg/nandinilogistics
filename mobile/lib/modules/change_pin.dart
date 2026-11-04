import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Change the 4-digit PIN. The current one is asked first — the server checks
/// it, so a phone left unlocked cannot be re-keyed by whoever picks it up.
class ChangePinScreen extends StatefulWidget {
  const ChangePinScreen({super.key, required this.api});
  final Api api;

  @override
  State<ChangePinScreen> createState() => _ChangePinScreenState();
}

class _ChangePinScreenState extends State<ChangePinScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  bool _reveal = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final four = RegExp(r'^\d{4}$');
    String? problem;
    if (!four.hasMatch(_current.text)) {
      problem = 'Enter your current 4-digit PIN.';
    } else if (!four.hasMatch(_next.text)) {
      problem = 'The new PIN is 4 digits.';
    } else if (_next.text != _again.text) {
      problem = 'The two new PINs do not match.';
    }
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final res = await widget.api.run('hr/changeOwnPin', [_current.text, _next.text]);
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.missing ? notOnServer : res.error;
      });
      return;
    }
    notify(context, 'PIN changed. Use it next time you sign in.');
    Navigator.of(context).pop(true);
  }

  Widget _pin(String label, TextEditingController c, {Key? key}) => Field(
        fieldKey: key,
        label: label,
        controller: c,
        hint: '4 digits',
        obscure: !_reveal,
        keyboard: TextInputType.number,
        formatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
        enabled: !_busy,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Change PIN', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(T.gutter), children: [
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _pin('Current PIN', _current, key: const Key('pin-current')),
                const SizedBox(height: 12),
                _pin('New PIN', _next, key: const Key('pin-new')),
                const SizedBox(height: 12),
                _pin('New PIN again', _again, key: const Key('pin-again')),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _reveal = !_reveal),
                    icon: Icon(_reveal ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 18),
                    label: Text(_reveal ? 'Hide' : 'Show'),
                  ),
                ),
                if (_error != null) ...[
                  Alert(_error!, tone: Tone.bad),
                  const SizedBox(height: 12),
                ],
                Btn('Save new PIN',
                    key: const Key('pin-save'), expand: true, height: 52, busy: _busy, onPressed: _save),
              ]),
            ),
            const SizedBox(height: 10),
            Text('Forgot the current one? Sign out and tap Forgot PIN on the sign-in screen.',
                textAlign: TextAlign.center, style: T.caption(color: T.muted)),
          ]),
        ),
      ]),
    );
  }
}
