import 'package:flutter/material.dart';

import '../session.dart';
import '../theme.dart';

/// Signing in, and the three different things a refusal can mean.
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

  /// The server was never reached. Worth saying apart from a refusal, because
  /// the password is not the problem and the fix is not on this screen.
  bool _unreachable = false;

  /// True when the refusal is final: the password field is taken away, because
  /// typing it again cannot help and offering it says otherwise.
  bool _final = false;

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

    /*
     * Wrapped, because the one thing worse than a sign-in that fails is a
     * sign-in that neither succeeds nor fails: an unhandled throw here leaves
     * `_busy` true and the button turning for ever, with nothing on screen.
     * That is how this screen behaved when the server could not be reached.
     */
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
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Something went wrong signing in: $error';
        _final = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: T.navy,
            padding: const EdgeInsets.fromLTRB(24, 68, 24, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: T.brand,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(Icons.home_work_rounded, color: Colors.white, size: 26),
                ),
                const SizedBox(height: 16),
                Text('NN Infra', style: T.heading(25, color: Colors.white, weight: FontWeight.w800)),
                const SizedBox(height: 5),
                Text(
                  'Construction & real-estate ERP.\nSign in with the same account you use on the web.',
                  style: T.body(13, color: const Color(0xFF9BA1C2)),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('EMAIL', style: T.eyebrow),
                  const SizedBox(height: 6),
                  TextField(
                    key: const Key('email'),
                    controller: _email,
                    enabled: !_busy && !_final,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    style: T.body(15),
                    decoration: _field(Icons.mail_outline_rounded, 'you@nninfra.example'),
                  ),
                  const SizedBox(height: 13),
                  Text('PASSWORD', style: T.eyebrow),
                  const SizedBox(height: 6),
                  if (!_final)
                    TextField(
                      key: const Key('password'),
                      controller: _password,
                      enabled: !_busy,
                      obscureText: !_reveal,
                      onSubmitted: (_) => _submit(),
                      style: T.body(15),
                      decoration: _field(Icons.lock_outline_rounded, '').copyWith(
                        suffixIcon: IconButton(
                          icon: Icon(
                            _reveal ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                            size: 20,
                            color: T.brandInk,
                          ),
                          onPressed: () => setState(() => _reveal = !_reveal),
                          tooltip: _reveal ? 'Hide password' : 'Show password',
                        ),
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: T.surface,
                        border: Border.all(color: T.border),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Text(
                        'Not the password. Nothing to retry here.',
                        style: T.body(13, color: T.muted),
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _Refusal(
                      message: _error!,
                      isFinal: _final,
                      unreachable: _unreachable,
                      /*
                       * Shown on *every* failure, not only when the server
                       * cannot be reached.
                       *
                       * "Email or password is incorrect" is the right answer
                       * and has to stay vague — revealing whether an address
                       * exists is how account lists get built. But a build
                       * pointed at a test server has a different set of
                       * accounts in it, and a correct password for the real
                       * system is wrong there. That reads as a broken app
                       * unless the screen says which server it asked, and the
                       * address is already in the binary of the build they
                       * were handed, so saying it gives nothing away.
                       */
                      server: widget.auth.api.baseUrl,
                    ),
                  ],
                  const SizedBox(height: 17),
                  SizedBox(
                    height: 50,
                    child: FilledButton(
                      key: const Key('submit'),
                      onPressed: (_busy || _final) ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: T.brand,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                            )
                          : Text('Sign in', style: T.body(15.5, color: Colors.white, weight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(height: 11),
                  Text(
                    'The device name is sent with the sign-in, so an administrator can recognise and stop it under Active sessions.',
                    textAlign: TextAlign.center,
                    style: T.body(11.5, color: T.muted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _field(IconData icon, String hint) => InputDecoration(
        hintText: hint,
        hintStyle: T.body(15, color: T.faint),
        prefixIcon: Icon(icon, size: 20, color: T.faint),
        filled: true,
        fillColor: T.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: T.borderStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: T.brand, width: 1.5),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: T.border),
        ),
      );
}

/// A refusal, toned by whether there is anything to try again.
///
/// Three different things, deliberately looking different: a password that was
/// wrong (red, try again), an account that may not use the app (plum, stop),
/// and a server that was never reached (amber — nothing to do with the
/// password, and nothing on this screen will fix it).
class _Refusal extends StatelessWidget {
  const _Refusal({
    required this.message,
    required this.isFinal,
    this.unreachable = false,
    this.server,
  });

  final String message;
  final bool isFinal;
  final bool unreachable;

  /// The address the app was built against, shown only when it was not reached.
  final String? server;

  @override
  Widget build(BuildContext context) {
    final (bg, line, ink, icon) = unreachable
        ? (T.warnBg, T.warnLine, T.warn, Icons.wifi_off_rounded)
        : isFinal
            ? (T.plumBg, T.plumLine, T.plum, Icons.phonelink_erase_rounded)
            : (T.badBg, T.badLine, T.bad, Icons.error_outline_rounded);

    return Container(
      key: const Key('refusal'),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: ink),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message, style: T.body(12.5, color: ink, weight: FontWeight.w600)),
                if (server != null) ...[
                  const SizedBox(height: 5),
                  Text(
                    unreachable
                        ? 'This app was built to use $server'
                        : 'Asked $server — accounts differ between servers',
                    key: const Key('server-address'),
                    style: T.numeric(11, color: ink, weight: FontWeight.w500),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
