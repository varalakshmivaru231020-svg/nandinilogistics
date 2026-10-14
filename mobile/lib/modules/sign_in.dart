import 'package:flutter/material.dart';

import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.auth, required this.onSignedIn});

  final Auth auth;
  final void Function(Session) onSignedIn;

  @override
  State<SignInScreen> createState() => SignInScreenState();
}

class SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _reveal = false;
  String? _error;
  bool _final = false;
  bool _unreachable = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _unreachable = false;
    });
    try {
      final res = await widget.auth.signIn(_email.text, _password.text, 'Android');
      if (!mounted) return;
      if (res.ok) {
        widget.onSignedIn(res.data!);
        return;
      }
      setState(() {
        _busy = false;
        _error = res.error;
        _final = Auth.isFinal(res);
        _unreachable = res.unreachable;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Something went wrong signing in: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: T.navy950,
          padding: EdgeInsets.fromLTRB(24, MediaQuery.of(context).padding.top + 44, 24, 30),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(13),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [T.brand500, T.navy800],
                ),
              ),
              child: const Icon(Icons.home_work_rounded, color: Colors.white, size: 26),
            ),
            const SizedBox(height: 16),
            Text('NN Infra', style: T.display(color: Colors.white)),
            const SizedBox(height: 5),
            Text(
              'Construction & real-estate ERP.\nSign in with the same account you use on the web.',
              style: T.secondaryText(color: T.onNavySecondary),
            ),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Field(
                fieldKey: const Key('email'),
                label: 'Email',
                controller: _email,
                hint: 'you@nninfra.example',
                keyboard: TextInputType.emailAddress,
                enabled: !_busy && !_final,
              ),
              const SizedBox(height: 13),
              if (!_final)
                Field(
                  fieldKey: const Key('password'),
                  label: 'Password',
                  controller: _password,
                  obscure: !_reveal,
                  enabled: !_busy,
                  onSubmit: _submit,
                  suffix: IconButton(
                    tooltip: _reveal ? 'Hide password' : 'Show password',
                    icon: Icon(_reveal ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                        size: 20, color: T.brand700),
                    onPressed: () => setState(() => _reveal = !_reveal),
                  ),
                )
              else
                Panel(
                  child: Text('Not the password. Nothing to retry here.',
                      style: T.secondaryText(color: T.muted)),
                ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                Alert(
                  _error!,
                  tone: _unreachable ? Tone.warn : (_final ? Tone.plum : Tone.bad),
                  // Baked in at build time, so when it is wrong there is nothing
                  // in the app to change — and no way to tell without being told.
                  detail: _unreachable
                      ? 'This app was built to use ${widget.auth.api.baseUrl}'
                      : 'Asked ${widget.auth.api.authority} — accounts differ between servers',
                ),
              ],
              const SizedBox(height: 17),
              Btn('Sign in',
                  key: const Key('submit'),
                  expand: true,
                  height: 50,
                  busy: _busy,
                  onPressed: _final ? null : _submit),
              const SizedBox(height: 11),
              Text(
                'The device name is sent with the sign-in, so an administrator can '
                'recognise and stop it under Active sessions.',
                textAlign: TextAlign.center,
                style: T.caption().copyWith(fontWeight: FontWeight.w500, height: 1.45),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
