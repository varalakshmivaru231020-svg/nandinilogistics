import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../core/api.dart';
import '../core/share.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// The rider's ID card, as the server composes it, and a way to send it on as
/// a picture.
class IdCardScreen extends StatefulWidget {
  const IdCardScreen({super.key, required this.api});

  final Api api;

  @override
  State<IdCardScreen> createState() => _IdCardScreenState();
}

class _IdCardScreenState extends State<IdCardScreen> {
  final _card = GlobalKey();
  Map<String, dynamic>? _data;
  Uint8List? _photo;
  String? _error;
  bool _loading = true;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await widget.api.get('/id-card');
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.code == 'no-rider'
            ? 'There is no rider profile on this account, so there is no ID card.'
            : res.missing
                ? notOnServer
                : res.error;
      });
      return;
    }
    final url = res.data!['photoUrl'] as String?;
    final file = url == null || url.isEmpty ? null : await widget.api.file(url);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _data = res.data;
      _photo = file == null ? null : Uint8List.fromList(file.bytes);
    });
  }

  Future<void> _share() async {
    setState(() => _sharing = true);
    String? problem;
    try {
      final boundary = _card.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final id = '${_data?["riderId"] ?? "rider"}';
      problem = await Sharer.live.image(bytes!.buffer.asUint8List(),
          name: 'nandini-id-$id.png', text: 'Nandini Logistics ID card — $id');
    } catch (_) {
      problem = 'The card could not be turned into a picture.';
    }
    if (!mounted) return;
    setState(() => _sharing = false);
    if (problem != null) notify(context, problem);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(title: 'ID card', onBack: () => Navigator.maybePop(context)),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Padding(
                      padding: const EdgeInsets.all(T.gutter),
                      child: Alert(_error!, tone: Tone.warn),
                    )
                  : ListView(padding: const EdgeInsets.all(T.gutter), children: [
                      RepaintBoundary(key: _card, child: IdCard(data: _data!, photo: _photo)),
                      const SizedBox(height: 16),
                      Btn('Share as image',
                          key: const Key('share-card'),
                          icon: Icons.share_rounded,
                          expand: true,
                          busy: _sharing,
                          onPressed: _share),
                    ]),
        ),
      ]),
    );
  }
}

/// The card itself — what is drawn and what is shared.
class IdCard extends StatelessWidget {
  const IdCard({super.key, required this.data, this.photo});

  final Map<String, dynamic> data;
  final Uint8List? photo;

  String _s(String k) {
    final v = data[k];
    return v == null || '$v'.isEmpty ? '—' : '$v';
  }

  @override
  Widget build(BuildContext context) {
    final companies = ((data['companies'] as List?) ?? const []).map((e) => '$e').join(', ');
    Widget line(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 110, child: Text(label, style: T.caption(color: T.muted))),
            Expanded(child: Text(value, style: T.body(weight: FontWeight.w600))),
          ]),
        );
    return Container(
      decoration: BoxDecoration(
        color: T.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: T.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [T.navy950, T.navy800]),
          ),
          child: Row(children: [
            const Icon(Icons.two_wheeler_rounded, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Text('Nandini Logistics',
                  style: T.body(color: Colors.white, weight: FontWeight.w800).copyWith(fontSize: 16)),
            ),
            Text(_s('status'), style: T.caption(color: T.onNavyBody)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 84,
              height: 104,
              decoration: BoxDecoration(
                color: T.fieldFill,
                borderRadius: BorderRadius.circular(10),
                image: photo == null
                    ? null
                    : DecorationImage(image: MemoryImage(photo!), fit: BoxFit.cover),
              ),
              child: photo == null
                  ? const Icon(Icons.person_rounded, size: 44, color: T.faint)
                  : null,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_s('name'), style: T.screenTitle()),
                const SizedBox(height: 2),
                Text('Rider ID ${_s("riderId")}',
                    style: T.num(14, color: T.brand700, weight: FontWeight.w800)),
              ]),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(children: [
            line('Mobile', _s('mobile')),
            line('Client', companies.isEmpty ? _s('mainCompany') : companies),
            line('Insurance no.', _s('insuranceNumber')),
            line('Emergency no.', _s('emergencyNumber')),
          ]),
        ),
      ]),
    );
  }
}
