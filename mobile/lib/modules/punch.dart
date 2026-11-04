import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/punch_model.dart';
import '../core/viewer.dart';
import '../core/where.dart';
import '../design/components.dart';
import '../design/tokens.dart';

/// Monthly attendance: today's punch, the month's calendar, the hours
/// summary straight under it, every day's record, and the month as a PDF,
/// Excel or CSV. Every figure is the server's (`/attendance/me`); when an
/// older server sends no summary the counts are made from the days it did
/// send and the hours are left blank rather than guessed.
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

const _monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/// "8h 30m" from minutes, the way the server writes it.
String duration(Object? minutes) {
  final m = minutes is num ? minutes.round() : int.tryParse('$minutes');
  if (m == null) return '—';
  final h = m ~/ 60;
  final r = m % 60;
  if (h == 0) return '${r}m';
  return r == 0 ? '${h}h' : '${h}h ${r}m';
}

class PunchScreenState extends State<PunchScreen> {
  late String _month = widget.month ?? _monthOf(DateTime.now());
  bool _loading = true;
  bool _busy = false;
  bool _exporting = false;
  String? _loadError;
  String? _error;
  String? _done;
  Map<String, dynamic>? _today;
  Map<String, dynamic>? _summary;
  List<Map<String, dynamic>> _days = const [];
  int? _selectedDay;

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
      _summary = res.data!['summary'] as Map<String, dynamic>?;
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
    setState(() {
      _month = _monthOf(d);
      _selectedDay = null;
    });
    _load();
  }

  /// PDF, Excel or CSV of this month — the server renders it, the phone opens it.
  Future<void> _export() async {
    final format = await sheet<String>(
      context,
      title: 'Export monthly attendance',
      explain: '${_monthLabel()} — date-wise punches, hours and the monthly totals, with your name and Rider ID.',
      body: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final (key, label, icon) in const [
          ('pdf', 'PDF report', Icons.picture_as_pdf_outlined),
          ('xlsx', 'Excel (.xlsx)', Icons.table_chart_outlined),
          ('csv', 'CSV', Icons.grid_on_outlined),
        ]) ...[
          Btn(label,
              key: Key('export-$key'),
              icon: icon,
              emphasis: key == 'pdf' ? Emphasis.primary : Emphasis.outline,
              expand: true,
              onPressed: () => Navigator.pop(ctx, key)),
          const SizedBox(height: 10),
        ],
      ]),
    );
    if (format == null || !mounted) return;
    setState(() => _exporting = true);
    final got = await widget.api.file('/api/hr/attendance/mine/export?month=$_month&format=$format');
    if (!mounted) return;
    setState(() => _exporting = false);
    if (got == null) {
      notify(context, 'The report could not be downloaded. Check your connection and try again.');
      return;
    }
    final problem = await Viewer.live.open(
      name: 'attendance-$_month.$format',
      bytes: got.bytes,
      mime: got.mime,
    );
    if (problem != null && mounted) notify(context, problem);
  }

  String _monthLabel() {
    final p = _month.split('-');
    return '${_monthNames[int.parse(p[1]) - 1]} ${p[0]}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Monthly Attendance',
          subtitle: _monthLabel(),
          onBack: widget.onBack ?? () => Navigator.maybePop(context),
          actions: [
            BarButton(
              icon: Icons.ios_share_rounded,
              label: 'Export monthly attendance',
              onTap: () {
                if (!_loading && !_exporting) _export();
              },
            ),
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load),
          ],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _loadError != null
                  ? Padding(
                      padding: const EdgeInsets.all(T.gutter),
                      child: Alert(_loadError!, key: const Key('punch-load-error'), tone: Tone.warn),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 28),
                        children: [
                          _todayCard(),
                          const SizedBox(height: T.cardGap),
                          _calendar(),
                          const SizedBox(height: T.cardGap),
                          _summaryPanel(),
                          const SizedBox(height: T.cardGap),
                          _exportButton(),
                          const SizedBox(height: 20),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
                            child: Row(children: [
                              Text('Daily records', style: T.section()),
                              const Spacer(),
                              Text('${_days.length} days', style: T.caption(color: T.muted)),
                            ]),
                          ),
                          if (_days.isEmpty)
                            const Empty('No attendance recorded this month')
                          else
                            for (final d in _days.reversed) ...[_dayRow(d), const SizedBox(height: 8)],
                        ],
                      ),
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
    final hours = _today?['hours'];
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Overline('Today'),
          const Spacer(),
          if (hours != null) Text('$hours logged', style: T.caption(color: T.goodInk).copyWith(fontWeight: FontWeight.w700)),
        ]),
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
              onPressed: () => _punch(false))
        else
          Row(children: [
            const Icon(Icons.verified_rounded, size: 18, color: T.good),
            const SizedBox(width: 6),
            Text('Completed', style: T.body(weight: FontWeight.w700, color: T.goodInk)),
          ]),
        const SizedBox(height: 8),
        Text('Your location is recorded with each punch.', style: T.caption(color: T.muted)),
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

  static Tone _toneFor(String status, {bool incomplete = false}) {
    if (incomplete) return Tone.warn;
    return switch (status.toUpperCase()) {
      'PRESENT' => Tone.good,
      'ABSENT' => Tone.bad,
      'HALF_DAY' => Tone.warn,
      'LEAVE' || 'WEEK_OFF' || 'HOLIDAY' => Tone.info,
      _ => Tone.draft,
    };
  }

  static String _statusLabel(Map<String, dynamic> d) {
    if (d['incomplete'] == true || (d['punchInAt'] != null && d['punchOutAt'] == null)) return 'Incomplete';
    return switch ('${d["status"] ?? ""}'.toUpperCase()) {
      'PRESENT' => 'Present',
      'ABSENT' => 'Absent',
      'HALF_DAY' => 'Half day',
      final s => s.isEmpty ? '—' : s,
    };
  }

  Map<int, Map<String, dynamic>> get _byDay => {
        for (final d in _days)
          if (DateTime.tryParse('${d["date"]}') != null) DateTime.parse('${d["date"]}').day: d,
      };

  Widget _calendar() {
    final p = _month.split('-');
    final year = int.parse(p[0]);
    final month = int.parse(p[1]);
    final first = DateTime(year, month);
    final count = DateTime(year, month + 1, 0).day;
    final lead = first.weekday % 7; // Sunday first
    final byDay = _byDay;
    final now = DateTime.now();
    final isThisMonth = now.year == year && now.month == month;
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
            child: Column(children: [
              Text('${_monthNames[month - 1]} $year', textAlign: TextAlign.center, style: T.body(weight: FontWeight.w800)),
              if (isThisMonth) Text('This month', style: T.caption(color: T.accent700)),
            ]),
          ),
          IconButton(
            tooltip: 'Next month',
            icon: const Icon(Icons.chevron_right_rounded),
            onPressed: isThisMonth ? null : () => _shift(1),
          ),
        ]),
        Text('$present present this month', textAlign: TextAlign.center, style: T.caption(color: T.muted)),
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
            for (var day = 1; day <= count; day++)
              _cell(day, byDay[day], today: isThisMonth && now.day == day),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(spacing: 12, runSpacing: 6, children: [
          _legend(T.good, 'Present'),
          _legend(T.bad, 'Absent'),
          _legend(T.warn, 'Half day / incomplete'),
          _legend(T.line400, 'No record'),
        ]),
      ]),
    );
  }

  Widget _legend(Color c, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 5),
        Text(label, style: T.caption(color: T.secondary)),
      ]);

  Widget _cell(int day, Map<String, dynamic>? d, {bool today = false}) {
    final status = d == null ? '' : '${d["status"] ?? ""}';
    final incomplete = d != null && (d['incomplete'] == true || (d['punchInAt'] != null && d['punchOutAt'] == null));
    final c = status.isEmpty ? null : toneOf(_toneFor(status, incomplete: incomplete));
    final selected = _selectedDay == day;
    return Tooltip(
      message: status.isEmpty
          ? 'No record'
          : '${_statusLabel(d!)} · ${clock(d["punchInAt"])} – ${clock(d["punchOutAt"])}',
      child: InkWell(
        onTap: d == null ? null : () => _showDay(day, d),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          key: Key('day-$day'),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: c?.fill ?? T.fieldFill,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected ? T.accent500 : (today ? T.ink : Colors.transparent),
              width: selected || today ? 1.5 : 0,
            ),
          ),
          child: Text('$day', style: T.num(12, color: c?.ink ?? T.secondary, weight: FontWeight.w700)),
        ),
      ),
    );
  }

  /// The month's hours, immediately under the calendar.
  Widget _summaryPanel() {
    final s = _summary;
    // An older server sends no summary: count what it did send.
    final present = s?['present'] ?? _days.where((d) => '${d["status"]}'.toUpperCase() == 'PRESENT').length;
    final absent = s?['absent'] ?? _days.where((d) => '${d["status"]}'.toUpperCase() == 'ABSENT').length;
    final half = s?['halfDay'] ?? _days.where((d) => '${d["status"]}'.toUpperCase() == 'HALF_DAY').length;
    final working = s?['workingDays'] ?? _days.length;
    final incomplete = s?['incomplete'] ?? _days.where((d) => d['punchInAt'] != null && d['punchOutAt'] == null).length;
    final total = s?['totalHours'] ?? '—';
    final avg = s?['averageHours'] ?? '—';

    Widget tile(String label, String value, {Color? ink}) => Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: T.card,
              borderRadius: BorderRadius.circular(T.rControl),
              border: Border.all(color: T.line),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: T.caption(color: T.muted)),
              const SizedBox(height: 2),
              Text(value, style: T.metric(17, color: ink ?? T.ink), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
        );

    return Panel(
      key: const Key('month-summary'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Overline('Monthly working hours'),
          const Spacer(),
          Text(_monthLabel(), style: T.caption(color: T.muted)),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          tile('Total hours', '$total'),
          const SizedBox(width: 8),
          tile('Avg / day', '$avg'),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          tile('Working days', '$working'),
          const SizedBox(width: 8),
          tile('Present', '$present', ink: T.goodInk),
          const SizedBox(width: 8),
          tile('Absent', '$absent', ink: T.badInk),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          tile('Half day', '$half', ink: T.warnInk),
          const SizedBox(width: 8),
          tile('Incomplete', '$incomplete', ink: (incomplete is num && incomplete > 0) ? T.warnInk : null),
        ]),
        if (s == null) ...[
          const SizedBox(height: 8),
          Text('Hours need the newer server; the counts are from this month\'s records.',
              style: T.caption(color: T.muted)),
        ],
      ]),
    );
  }

  Widget _exportButton() => Btn(
        _exporting ? 'Preparing…' : 'Export monthly attendance',
        key: const Key('export-month'),
        icon: Icons.download_rounded,
        emphasis: Emphasis.outline,
        expand: true,
        busy: _exporting,
        onPressed: _exporting ? null : _export,
      );

  Widget _dayRow(Map<String, dynamic> d) {
    final date = DateTime.tryParse('${d["date"]}');
    final incomplete = d['incomplete'] == true || (d['punchInAt'] != null && d['punchOutAt'] == null);
    final tone = _toneFor('${d["status"] ?? ""}', incomplete: incomplete);
    final c = toneOf(tone);
    final title = date == null
        ? '${d["date"]}'
        : '${_monthNames[date.month - 1].substring(0, 3)} ${date.day.toString().padLeft(2, '0')}, ${_dayNames[date.weekday - 1]}';
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      onTap: date == null ? null : () => _showDay(date.day, d),
      child: Row(children: [
        Container(
          width: 6,
          height: 44,
          decoration: BoxDecoration(color: c.line == Colors.transparent ? c.ink : c.ink, borderRadius: BorderRadius.circular(3)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: T.rowTitle()),
            const SizedBox(height: 3),
            Text(
              d['punchInAt'] == null
                  ? 'No punch recorded'
                  : 'In ${clock12(d["punchInAt"])} · Out ${d["punchOutAt"] == null ? "Not recorded" : clock12(d["punchOutAt"])}',
              style: T.caption(color: T.secondary),
            ),
          ]),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(d['minutes'] == null ? '—' : duration(d['minutes']), style: T.num(14, weight: FontWeight.w800)),
          const SizedBox(height: 4),
          Pill(_statusLabel(d), compact: true, tone: tone),
        ]),
      ]),
    );
  }

  Future<void> _showDay(int day, Map<String, dynamic> d) async {
    setState(() => _selectedDay = day);
    final date = DateTime.tryParse('${d["date"]}');
    final title = date == null
        ? '${d["date"]}'
        : '${_dayNames[date.weekday - 1]}, ${date.day} ${_monthNames[date.month - 1]} ${date.year}';
    Widget line(String k, String v) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            SizedBox(width: 120, child: Text(k, style: T.caption(color: T.muted))),
            Expanded(child: Text(v, style: T.body(weight: FontWeight.w700))),
          ]),
        );
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: T.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(T.rSheet))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 18, 20, MediaQuery.of(ctx).padding.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: T.section()),
          const SizedBox(height: 14),
          line('Punch in', d['punchInAt'] == null ? '—' : clock12(d['punchInAt'])),
          line('Punch out', d['punchOutAt'] == null ? (d['punchInAt'] == null ? '—' : 'Not recorded') : clock12(d['punchOutAt'])),
          line('Hours logged', d['minutes'] == null ? '—' : duration(d['minutes'])),
          line('Status', _statusLabel(d)),
        ]),
      ),
    );
  }
}
