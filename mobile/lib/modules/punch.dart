import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/where.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Punch in and out from the phone, with where it was done, and the month's
/// attendance under it.
///
/// The position is read at the moment of punching — never cached — through
/// the [Where] seam, which asks Android for permission the way it expects.
class PunchScreen extends StatefulWidget {
  const PunchScreen({super.key, required this.api, this.month, this.onBack});

  final Api api;

  /// The month to open on, "yyyy-mm". This month when not given.
  final String? month;
  final VoidCallback? onBack;

  @override
  State<PunchScreen> createState() => PunchScreenState();
}

String _monthOf(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';

/// "09:42" in the phone's own time.
String clock(Object? iso) {
  final d = DateTime.tryParse('${iso ?? ""}')?.toLocal();
  if (d == null) return '—';
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

class PunchScreenState extends State<PunchScreen> {
  late String _month = widget.month ?? _monthOf(DateTime.now());
  bool _loading = true;
  bool _busy = false;
  String? _loadError;
  String? _error;
  String? _done;
  Map<String, dynamic>? _today;
  List<Map<String, dynamic>> _days = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    final res = await widget.api.get('/attendance/me', query: {'month': _month});
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (!res.ok) {
        _loadError = res.missing ? notOnServer : res.error;
        return;
      }
      _today = res.data!['today'] as Map<String, dynamic>?;
      _days = ((res.data!['days'] as List?) ?? const []).cast<Map<String, dynamic>>();
    });
  }

  bool get _in => _today?['punchInAt'] != null;
  bool get _out => _today?['punchOutAt'] != null;

  Future<void> _punch(bool punchIn) async {
    setState(() {
      _busy = true;
      _error = null;
      _done = null;
    });
    final where = Where.live;
    final at = await where.position();
    if (!mounted) return;
    if (at == null) {
      setState(() {
        _busy = false;
        _error = where.problem ?? 'Your location could not be read.';
      });
      return;
    }
    final res = await widget.api.run(punchIn ? 'hr/punchIn' : 'hr/punchOut', [at.lat, at.lng]);
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.missing ? notOnServer : res.error;
      });
      return;
    }
    _busy = false;
    _done = punchIn ? 'Punched in.' : 'Punched out.';
    await _load();
  }

  void _shift(int by) {
    final p = _month.split('-');
    final d = DateTime(int.parse(p[0]), int.parse(p[1]) + by);
    setState(() => _month = _monthOf(d));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Punch in / out',
          subtitle: 'Attendance',
          onBack: widget.onBack ?? () => Navigator.maybePop(context),
          actions: [BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load)],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _loadError != null
                  ? Padding(
                      padding: const EdgeInsets.all(T.gutter),
                      child: Alert(_loadError!, key: const Key('punch-load-error'), tone: Tone.warn),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 24),
                      children: [
                        _todayCard(),
                        const SizedBox(height: 18),
                        _calendar(),
                      ],
                    ),
        ),
      ]),
    );
  }

  Widget _todayCard() {
    final String state;
    final Tone tone;
    if (!_in) {
      state = 'Not punched in yet';
      tone = Tone.draft;
    } else if (!_out) {
      state = 'Punched in at ${clock(_today!['punchInAt'])}';
      tone = Tone.info;
    } else {
      state = 'Done for today · ${clock(_today!['punchInAt'])} – ${clock(_today!['punchOutAt'])}';
      tone = Tone.good;
    }
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Overline('Today'),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: Pill(state, key: const Key('punch-state'), tone: tone),
        ),
        const SizedBox(height: 14),
        if (!_in)
          Btn('Punch in',
              key: const Key('punch-in'),
              icon: Icons.login_rounded,
              expand: true,
              busy: _busy,
              onPressed: () => _punch(true))
        else if (!_out)
          Btn('Punch out',
              key: const Key('punch-out'),
              icon: Icons.logout_rounded,
              emphasis: Emphasis.outline,
              expand: true,
              busy: _busy,
              onPressed: () => _punch(false)),
        const SizedBox(height: 8),
        Text('Your location is recorded with each punch.',
            style: T.caption(color: T.muted)),
        if (_done != null) ...[
          const SizedBox(height: 10),
          Alert(_done!, tone: Tone.good),
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          Alert(_error!, key: const Key('punch-error'), tone: Tone.warn),
        ],
      ]),
    );
  }

  static Tone _toneFor(String status) => switch (status.toUpperCase()) {
        'PRESENT' => Tone.good,
        'ABSENT' => Tone.bad,
        'HALF_DAY' => Tone.warn,
        'LEAVE' || 'WEEK_OFF' || 'HOLIDAY' => Tone.plum,
        _ => Tone.draft,
      };

  Widget _calendar() {
    final p = _month.split('-');
    final year = int.parse(p[0]);
    final month = int.parse(p[1]);
    final first = DateTime(year, month);
    final count = DateTime(year, month + 1, 0).day;
    final lead = first.weekday % 7; // Sunday first
    final byDay = <int, Map<String, dynamic>>{
      for (final d in _days)
        if (DateTime.tryParse('${d["date"]}') != null) DateTime.parse('${d["date"]}').day: d,
    };
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final present = _days.where((d) => '${d["status"]}'.toUpperCase() == 'PRESENT').length;

    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          IconButton(
            tooltip: 'Previous month',
            icon: const Icon(Icons.chevron_left_rounded),
            onPressed: () => _shift(-1),
          ),
          Expanded(
            child: Text('${names[month - 1]} $year',
                textAlign: TextAlign.center, style: T.body(weight: FontWeight.w700)),
          ),
          IconButton(
            tooltip: 'Next month',
            icon: const Icon(Icons.chevron_right_rounded),
            onPressed: () => _shift(1),
          ),
        ]),
        Text('$present present this month',
            textAlign: TextAlign.center, style: T.caption(color: T.muted)),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          children: [
            for (final w in const ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
              Center(child: Text(w, style: T.caption(color: T.muted))),
            for (var i = 0; i < lead; i++) const SizedBox.shrink(),
            for (var day = 1; day <= count; day++) _cell(day, byDay[day]),
          ],
        ),
      ]),
    );
  }

  Widget _cell(int day, Map<String, dynamic>? d) {
    final status = d == null ? '' : '${d["status"] ?? ""}';
    final c = status.isEmpty ? null : toneOf(_toneFor(status));
    return Tooltip(
      message: status.isEmpty
          ? 'No record'
          : '$status · ${clock(d!["punchInAt"])} – ${clock(d["punchOutAt"])}',
      child: Container(
        key: Key('day-$day'),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: c?.fill ?? T.fieldFill,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text('$day', style: T.num(12, color: c?.ink ?? T.secondary, weight: FontWeight.w700)),
      ),
    );
  }
}
