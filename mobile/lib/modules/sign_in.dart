import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'sign_up.dart';

/// The two ways in: a rider's mobile number and four-digit PIN (the default),
/// and the email and password staff use on the web.
enum SignInMode { pin, email }

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
  final _mobile = TextEditingController();
  final _pin = TextEditingController();
  SignInMode _mode = SignInMode.pin;
  bool _busy = false;
  bool _reveal = false;
  String? _error;
  String? _info;
  bool _final = false;
  bool _unreachable = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _mobile.dispose();
    _pin.dispose();
    super.dispose();
  }

  void _switch(SignInMode m) => setState(() {
        _mode = m;
        _error = null;
        _info = null;
        _final = false;
        _unreachable = false;
      });

  Future<void> _submit() async {
    if (_mode == SignInMode.pin) {
      if (_mobile.text.trim().length < 10) {
        setState(() => _error = 'Enter your 10-digit mobile number.');
        return;
      }
      if (!RegExp(r'^\d{4}$').hasMatch(_pin.text)) {
        setState(() => _error = 'Your PIN is 4 digits.');
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
      _unreachable = false;
    });
    try {
      final res = _mode == SignInMode.pin
          ? await widget.auth.pinLogin(_mobile.text, _pin.text, 'Android')
          : await widget.auth.signIn(_email.text, _password.text, 'Android');
      if (!mounted) return;
      if (res.ok) {
        widget.onSignedIn(res.data!);
        return;
      }
      setState(() {
        _busy = false;
        _error = _mode == SignInMode.pin && res.code == 'credentials'
            ? 'That mobile number and PIN do not match.'
            : res.error;
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

  Future<void> _forgot() async {
    if (_mobile.text.trim().length < 10) {
      setState(() => _error = 'Enter your mobile number first, then tap Forgot PIN.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    final res = await widget.auth.forgotPin(_mobile.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (res.ok) {
        _info = res.data;
      } else {
        _error = res.error;
        _unreachable = res.unreachable;
      }
    });
  }

  Future<void> _signUp() async {
    final s = await Navigator.of(context).push<Session>(
      MaterialPageRoute(builder: (_) => SignUpScreen(auth: widget.auth)),
    );
    if (s != null && mounted) widget.onSignedIn(s);
  }

  @override
  Widget build(BuildContext context) {
    final pin = _mode == SignInMode.pin;
    return Scaffold(
      backgroundColor: T.page,
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: T.navy950,
          padding: EdgeInsets.fromLTRB(24, MediaQuery.of(context).padding.top + 40, 24, 26),
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
              child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 26),
            ),
            const SizedBox(height: 16),
            Text('Nandini Rider', style: T.display(color: Colors.white)),
            const SizedBox(height: 5),
            Text(
              pin
                  ? 'Nandini Logistics.\nSign in with your mobile number and PIN.'
                  : 'Nandini Logistics.\nStaff: sign in with the account you use on the web.',
              style: T.secondaryText(color: T.onNavySecondary),
            ),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                FilterChip2(
                  key: const Key('mode-pin'),
                  label: 'Mobile + PIN',
                  selected: pin,
                  onTap: () => _switch(SignInMode.pin),
                ),
                const SizedBox(width: 8),
                FilterChip2(
                  key: const Key('mode-email'),
                  label: 'Email + password',
                  selected: !pin,
                  onTap: () => _switch(SignInMode.email),
                ),
              ]),
              const SizedBox(height: 16),
              if (pin) ...[
                Field(
                  fieldKey: const Key('mobile'),
                  label: 'Mobile number',
                  controller: _mobile,
                  hint: '10-digit mobile',
                  keyboard: TextInputType.phone,
                  formatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  enabled: !_busy && !_final,
                ),
                const SizedBox(height: 13),
                if (!_final)
                  Field(
                    fieldKey: const Key('pin'),
                    label: 'PIN',
                    controller: _pin,
                    hint: '4 digits',
                    obscure: true,
                    keyboard: TextInputType.number,
                    formatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4),
                    ],
                    enabled: !_busy,
                    onSubmit: _submit,
                  ),
              ] else ...[
                Field(
                  fieldKey: const Key('email'),
                  label: 'Email',
                  controller: _email,
                  hint: 'you@nandini.example',
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
                      icon: Icon(
                          _reveal ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                          size: 20,
                          color: T.brand700),
                      onPressed: () => setState(() => _reveal = !_reveal),
                    ),
                  ),
              ],
              if (_final)
                Panel(
                  child: Text('Nothing to retry here.', style: T.secondaryText(color: T.muted)),
                ),
              if (_info != null) ...[
                const SizedBox(height: 14),
                Alert(_info!, tone: Tone.good),
              ],
              if (_error != null) ...[
                const SizedBox(height: 14),
                Alert(
                  _error!,
                  tone: _unreachable ? Tone.warn : (_final ? Tone.plum : Tone.bad),
                  detail: _unreachable
                      ? 'This app was built to use ${widget.auth.api.baseUrl}'
                      : null,
                ),
              ],
              const SizedBox(height: 17),
              Btn('Sign in',
                  key: const Key('submit'),
                  expand: true,
                  height: 50,
                  busy: _busy,
                  onPressed: _final ? null : _submit),
              if (pin) ...[
                const SizedBox(height: 6),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  TextButton(
                    key: const Key('forgot-pin'),
                    onPressed: _busy ? null : _forgot,
                    child: const Text('Forgot PIN?'),
                  ),
                  TextButton(
                    key: const Key('sign-up'),
                    onPressed: _busy ? null : _signUp,
                    child: const Text('New rider? Sign up'),
                  ),
                ]),
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}
