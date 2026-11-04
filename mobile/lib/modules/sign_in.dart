import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'sign_up.dart';

/// The two ways in: a rider's mobile number and four-digit PIN (the default),
/// and the email and password staff use on the web. No biometrics — there is
/// nothing on the server to pair them with.
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
  bool _revealPin = false;
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
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: T.page,
      body: Stack(children: [
        // The hero: a red wave with the logo on it, fading to the page.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: ClipPath(
              clipper: _HeroWave(),
              child: Container(
                height: top + 250,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFE9474F), T.accent500, T.accent700],
                  ),
                ),
                child: Stack(children: [
                  Positioned(right: -70, top: -40, child: _ring(220, 0.10)),
                  Positioned(right: 30, top: 90, child: _ring(110, 0.12)),
                  Positioned(left: -40, bottom: 20, child: _ring(150, 0.08)),
                ]),
              ),
            ),
          ),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: EdgeInsets.fromLTRB(24, top + 24, 24, 0),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: T.soft,
                ),
                child: Image.asset('assets/brand/nandini-logo.png',
                    width: 56,
                    height: 44,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.two_wheeler_rounded, size: 36, color: T.accent500)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Nandini', style: T.section(color: Colors.white).copyWith(fontSize: 22, height: 1.05)),
                  Text('Logistics', style: T.section(color: Colors.white).copyWith(fontSize: 22, height: 1.05)),
                ]),
              ),
            ]),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, top + 150, 20, 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Welcome to', style: T.display().copyWith(fontSize: 24, height: 1.15)),
                Text('Nandini Logistics',
                    key: const Key('welcome'),
                    style: T.display(color: T.accent500).copyWith(fontSize: 28, height: 1.15)),
                const SizedBox(height: 6),
                Text("Let's get you started.", style: T.secondaryText()),
                const SizedBox(height: 18),
                _modes(pin),
                const SizedBox(height: 14),
                Panel(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (pin) ...[
                      Field(
                        fieldKey: const Key('mobile'),
                        label: 'Mobile number',
                        controller: _mobile,
                        hint: 'Enter 10 digit mobile number',
                        keyboard: TextInputType.phone,
                        formatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(10),
                        ],
                        enabled: !_busy && !_final,
                        suffix: const Padding(
                          padding: EdgeInsets.only(right: 12),
                          child: Text('+91', style: TextStyle(fontWeight: FontWeight.w700, color: T.secondary)),
                        ),
                      ),
                      const SizedBox(height: 13),
                      if (!_final)
                        Field(
                          fieldKey: const Key('pin'),
                          label: 'PIN',
                          controller: _pin,
                          hint: 'Enter 4 digit PIN',
                          obscure: !_revealPin,
                          keyboard: TextInputType.number,
                          formatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(4),
                          ],
                          enabled: !_busy,
                          onSubmit: _submit,
                          suffix: IconButton(
                            tooltip: _revealPin ? 'Hide PIN' : 'Show PIN',
                            icon: Icon(
                                _revealPin ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                                size: 20,
                                color: T.accent700),
                            onPressed: () => setState(() => _revealPin = !_revealPin),
                          ),
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
                                color: T.accent700),
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
                    Btn('Login',
                        key: const Key('submit'),
                        icon: Icons.arrow_forward_rounded,
                        expand: true,
                        height: 54,
                        busy: _busy,
                        onPressed: _final ? null : _submit),
                  ]),
                ),
                if (pin) ...[
                  const SizedBox(height: 8),
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
      ]),
    );
  }

  /// The two ways in, as a segmented switch: the chosen one filled red.
  Widget _modes(bool pin) {
    Widget seg(String label, bool on, Key key, VoidCallback onTap) => Expanded(
          child: Semantics(
            button: true,
            selected: on,
            child: InkWell(
              key: key,
              onTap: onTap,
              borderRadius: BorderRadius.circular(T.rPill),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? T.accent500 : Colors.transparent,
                  borderRadius: BorderRadius.circular(T.rPill),
                  boxShadow: on ? T.glow : null,
                ),
                child: Text(label,
                    style: T.buttonLabel(color: on ? Colors.white : T.secondary).copyWith(fontSize: 13.5)),
              ),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: T.card,
        borderRadius: BorderRadius.circular(T.rPill),
        border: Border.all(color: T.line),
      ),
      child: Row(children: [
        seg('Mobile + PIN', pin, const Key('mode-pin'), () => _switch(SignInMode.pin)),
        seg('Email + Password', !pin, const Key('mode-email'), () => _switch(SignInMode.email)),
      ]),
    );
  }

  static Widget _ring(double size, double alpha) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: alpha), width: 18),
        ),
      );
}

/// The hero's lower edge.
class _HeroWave extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final p = Path()..lineTo(0, size.height - 90);
    p.quadraticBezierTo(size.width * 0.2, size.height - 20, size.width * 0.5, size.height - 50);
    p.quadraticBezierTo(size.width * 0.78, size.height - 78, size.width, size.height - 30);
    p.lineTo(size.width, 0);
    p.close();
    return p;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> old) => false;
}
