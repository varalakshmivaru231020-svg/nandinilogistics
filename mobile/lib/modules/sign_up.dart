import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/pick_file.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// The checks the sign-up form makes before anything is sent. The server
/// validates again — this only saves a rider a round trip.
Map<String, String> signUpProblems(Map<String, String> v, Set<String> files) {
  final out = <String, String>{};
  String t(String k) => (v[k] ?? '').trim();
  final mobile = RegExp(r'^[6-9]\d{9}$');
  if (!mobile.hasMatch(t('mobile'))) out['mobile'] = 'Enter a valid 10-digit mobile number.';
  if (t('name').length < 2) out['name'] = 'Your name is required.';
  if (t('address').isEmpty) out['address'] = 'Your address is required.';
  if (!mobile.hasMatch(t('emergencyMobileFamily'))) {
    out['emergencyMobileFamily'] = 'A family member\'s 10-digit mobile is required.';
  }
  if (!mobile.hasMatch(t('emergencyMobileFriend'))) {
    out['emergencyMobileFriend'] = 'A friend\'s 10-digit mobile is required.';
  }
  if (!RegExp(r'^\d{12}$').hasMatch(t('aadhaar').replaceAll(' ', ''))) {
    out['aadhaar'] = 'Aadhaar is 12 digits.';
  }
  if (t('pan').isNotEmpty && !RegExp(r'^[A-Z]{5}\d{4}[A-Z]$').hasMatch(t('pan').toUpperCase())) {
    out['pan'] = 'PAN looks like ABCDE1234F.';
  }
  if (!RegExp(r'^\d{4}$').hasMatch(v['pin'] ?? '')) out['pin'] = 'Choose a 4-digit PIN.';
  if ((v['pin'] ?? '') != (v['confirmPin'] ?? '')) out['confirmPin'] = 'The PINs do not match.';
  if (!files.contains('photo')) out['photo'] = 'Add your photo.';
  if (!files.contains('doc:Aadhaar front')) out['doc:Aadhaar front'] = 'Add the front of your Aadhaar.';
  if (!files.contains('doc:Aadhaar back')) out['doc:Aadhaar back'] = 'Add the back of your Aadhaar.';
  return out;
}

/// Rider self sign-up (SOW §3.6 item 1).
///
/// The client company is not asked for: the server lists companies only after
/// sign-in, and the tele-caller assigns one during onboarding.
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key, required this.auth});

  final Auth auth;

  @override
  State<SignUpScreen> createState() => SignUpScreenState();
}

class SignUpScreenState extends State<SignUpScreen> {
  static const _text = [
    'referralCode', 'mobile', 'name', 'address', 'emergencyMobileFamily',
    'emergencyMobileFriend', 'aadhaar', 'pan', 'drivingLicence', 'pin', 'confirmPin',
  ];
  final Map<String, TextEditingController> _c = {
    for (final k in _text) k: TextEditingController(),
  };
  final Map<String, Upload> _files = {};
  Map<String, String> _problems = const {};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _attach(String field) async {
    final camera = await showModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            key: const Key('source-camera'),
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.pop(ctx, true),
          ),
          ListTile(
            key: const Key('source-gallery'),
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.pop(ctx, false),
          ),
        ]),
      ),
    );
    if (camera == null) return;
    final got = camera ? await Files.live.photo(field) : await Files.live.pick(field);
    if (got.isEmpty || !mounted) return;
    final f = got.first;
    setState(() => _files[field] = Upload(field: field, name: f.name, bytes: f.bytes, mime: f.mime));
  }

  Future<void> _submit() async {
    final values = {for (final e in _c.entries) e.key: e.value.text};
    final problems = signUpProblems(values, _files.keys.toSet());
    setState(() {
      _problems = problems;
      _error = problems.isEmpty ? null : 'Some details need attention.';
    });
    if (problems.isNotEmpty) return;

    setState(() => _busy = true);
    final fields = <String, String>{
      for (final k in _text)
        if (k != 'confirmPin' && values[k]!.trim().isNotEmpty)
          k: k == 'pan' ? values[k]!.trim().toUpperCase() : values[k]!.trim(),
    };
    fields['aadhaar'] = fields['aadhaar']!.replaceAll(' ', '');
    final res = await widget.auth.signUp(fields, _files.values.toList());
    if (!mounted) return;
    if (res.ok) {
      Navigator.of(context).pop(res.data);
      return;
    }
    setState(() {
      _busy = false;
      _error = res.status == 409
          ? 'This mobile number is already registered. Sign in instead, or use Forgot PIN.'
          : res.error;
    });
  }

  Widget _field(String key, String label,
      {String? hint, TextInputType? keyboard, int? digits, bool obscure = false, int lines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Field(
        fieldKey: Key('signup-$key'),
        label: label,
        controller: _c[key]!,
        hint: hint,
        keyboard: keyboard,
        obscure: obscure,
        lines: lines,
        error: _problems[key],
        enabled: !_busy,
        formatters: digits == null
            ? null
            : [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(digits)],
      ),
    );
  }

  Widget _file(String field, String label, {bool required = false}) {
    final chosen = _files[field];
    final problem = _problems[field];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Panel(
        border: problem != null ? T.badLine : null,
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Row(children: [
          Icon(chosen == null ? Icons.add_a_photo_outlined : Icons.check_circle_rounded,
              color: chosen == null ? T.muted : T.good),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label + (required ? ' *' : ''), style: T.body(weight: FontWeight.w600)),
              Text(problem ?? chosen?.name ?? 'Camera or gallery',
                  style: T.caption(color: problem != null ? T.badInk : T.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ]),
          ),
          Btn(chosen == null ? 'Add' : 'Change',
              key: Key('attach-$field'),
              emphasis: Emphasis.outline,
              height: 40,
              onPressed: _busy ? null : () => _attach(field)),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'Rider sign-up', subtitle: 'Nandini Logistics', onBack: () => Navigator.pop(context)),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(T.gutter, 16, T.gutter, 24),
            children: [
              const Overline('About you'),
              const SizedBox(height: 8),
              _field('referralCode', 'Referral ID (optional)', hint: 'The Rider ID of whoever referred you'),
              _field('mobile', 'Mobile number *', keyboard: TextInputType.phone, digits: 10),
              _field('name', 'Full name *'),
              _field('address', 'Address *', lines: 2),
              _field('emergencyMobileFamily', 'Emergency number — family *',
                  keyboard: TextInputType.phone, digits: 10),
              _field('emergencyMobileFriend', 'Emergency number — friend *',
                  keyboard: TextInputType.phone, digits: 10),
              const SizedBox(height: 6),
              const Overline('Identity'),
              const SizedBox(height: 8),
              _field('aadhaar', 'Aadhaar number *', keyboard: TextInputType.number, digits: 12),
              _field('pan', 'PAN (optional)', hint: 'ABCDE1234F'),
              _field('drivingLicence', 'Driving licence no. (optional)'),
              _file('photo', 'Your photo', required: true),
              _file('doc:Aadhaar front', 'Aadhaar — front', required: true),
              _file('doc:Aadhaar back', 'Aadhaar — back', required: true),
              _file('doc:PAN card', 'PAN card'),
              _file('doc:Driving licence', 'Driving licence'),
              const SizedBox(height: 6),
              const Overline('Your PIN'),
              const SizedBox(height: 8),
              _field('pin', 'Choose a 4-digit PIN *',
                  keyboard: TextInputType.number, digits: 4, obscure: true),
              _field('confirmPin', 'Confirm PIN *',
                  keyboard: TextInputType.number, digits: 4, obscure: true),
              if (_error != null) ...[
                Alert(_error!, key: const Key('signup-error')),
                const SizedBox(height: 12),
              ],
              Btn('Create my account',
                  key: const Key('signup-submit'),
                  expand: true,
                  height: 50,
                  busy: _busy,
                  onPressed: _submit),
            ],
          ),
        ),
      ]),
    );
  }
}
