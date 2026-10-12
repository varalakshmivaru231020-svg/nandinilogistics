import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';

/// Every dated thing in the system, on one grid.
///
/// The grid comes from the server — always six weeks, so the panel below never
/// changes height — and so does `serverTime`. Nothing here reads the phone's
/// clock: a handset with the wrong time must not disagree with the web about
/// what is overdue.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key, required this.api, required this.session});

  final Api api;
  final Session session;

  @override
  State<CalendarScreen> createState() => CalendarScreenState();
}

class CalendarScreenState extends State<CalendarScreen> {
  bool _loading = true;
  String? _error;
  List<String> _grid = const [];
  List<Map<String, dynamic>> _items = const [];
  Map<String, dynamic> _tally = const {};
  DateTime _anchor = DateTime.now();
  String? _picked;
  int _nowMs = 0;
  final Set<String> _kinds = {};

  static const _tone = {
    'brand': T.brand,
    'good': T.good,
    'warn': Color(0xFFE8A13A),
    'bad': Color(0xFFD8494A),
    'plum': T.plum,
    'slate': T.muted,
  };

  static const _labels = {
    'EVENT': 'Calendar',
    'INVITE': 'Invitation',
    'TASK': 'Task',
    'FOLLOW_UP': 'Follow-up',
    'SITE_VISIT': 'Site visit',
    'APPROVAL': 'Approval',
    'ACTIVITY': 'Activity',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _key(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await widget.api.get('/calendar', query: {'view': 'month', 'on': _key(_anchor)});
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final d = res.data!;
    setState(() {
      _loading = false;
      _grid = ((d['grid'] as List?) ?? const []).cast<String>();
      _items = ((d['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
      _tally = (d['tally'] as Map<String, dynamic>?) ?? const {};
      // The instant overdue is measured against — the server's, not the phone's.
      _nowMs = DateTime.parse(d['serverTime'] as String).millisecondsSinceEpoch;
      _picked ??= _key(DateTime.now());
    });
  }

  /// The days an item touches, so a span shows on every square it crosses.
  List<String> _daysOf(Map<String, dynamic> item) {
    final from = DateTime.parse(item['at'] as String).toLocal();
    final endRaw = item['endAt'] as String?;
    final to = endRaw == null ? from : DateTime.parse(endRaw).toLocal();
    if (to.isBefore(from)) return [_key(from)];
    final out = <String>[];
    var cursor = DateTime(from.year, from.month, from.day);
    final last = DateTime(to.year, to.month, to.day);
    while (!cursor.isAfter(last) && out.length < 60) {
      out.add(_key(cursor));
      cursor = cursor.add(const Duration(days: 1));
    }
    return out;
  }

  /// Past its moment and still waiting on somebody. A meeting that has finished
  /// is not overdue — it happened.
  static const _waits = {'TASK', 'FOLLOW_UP', 'SITE_VISIT', 'APPROVAL', 'INVITE'};

  bool _isOverdue(Map<String, dynamic> i) {
    if (i['done'] == true) return false;
    if (!_waits.contains(i['kind'])) return false;
    final when = (i['endAt'] as String?) ?? i['at'] as String;
    return DateTime.parse(when).millisecondsSinceEpoch < _nowMs;
  }

  List<Map<String, dynamic>> get _shown =>
      _kinds.isEmpty ? _items : _items.where((i) => _kinds.contains(i['kind'])).toList();

  List<Map<String, dynamic>> _onDay(String day) {
    final out = _shown.where((i) => _daysOf(i).contains(day)).toList();
    out.sort((a, b) {
      if (a['allDay'] != b['allDay']) return a['allDay'] == true ? -1 : 1;
      final at = DateTime.parse(a['at'] as String).compareTo(DateTime.parse(b['at'] as String));
      return at != 0 ? at : (a['title'] as String).compareTo(b['title'] as String);
    });
    return out;
  }

  @override
  Widget build(BuildContext context) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];

    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('EVERYTHING DATED, IN ONE PLACE',
                style: T.eyebrow.copyWith(color: const Color(0xFF9BA1C2), fontSize: 9.5)),
            Text('Calendar', style: T.heading(18, color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            key: const Key('reload-calendar'),
            tooltip: 'Reload',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, textAlign: TextAlign.center, style: T.body(14, color: T.bad)),
                  ),
                )
              : ListView(
                  children: [
                    _band(),
                    _monthBar(monthNames[_anchor.month - 1]),
                    _chips(),
                    _grid.isEmpty ? const SizedBox.shrink() : _month(),
                    if (_picked != null) _day(_picked!),
                    const SizedBox(height: 24),
                  ],
                ),
    );
  }

  Widget _band() {
    final shown = _shown;
    final overdue = shown.where(_isOverdue).length;
    final waiting = shown.where((i) => i['needsResponse'] == true).length;
    final cards = [
      ('${shown.length}', 'On this view', T.surface, T.border, T.muted),
      ('$waiting', 'Waiting on your answer', T.plumBg, T.plumLine, T.plum),
      ('$overdue', 'Overdue', T.badBg, T.badLine, T.bad),
      ('${_tally['total'] ?? shown.length}', 'In this month', T.surface, T.border, T.muted),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: cards
              .map((c) => Container(
                    width: 104,
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
                    decoration: BoxDecoration(
                      color: c.$3,
                      border: Border.all(color: c.$4),
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.$1, style: T.heading(20, weight: FontWeight.w800)),
                        const SizedBox(height: 1),
                        Text(c.$2, style: T.body(10.5, color: c.$5, weight: FontWeight.w600)),
                      ],
                    ),
                  ))
              .toList(),
        ),
      ),
    );
  }

  Widget _monthBar(String month) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(children: [
          _square(Icons.chevron_left_rounded, 'Previous month', () {
            setState(() => _anchor = DateTime(_anchor.year, _anchor.month - 1, 1));
            _load();
          }),
          const SizedBox(width: 8),
          Expanded(child: Text('$month ${_anchor.year}', style: T.heading(15.5))),
          TextButton(
            onPressed: () {
              setState(() {
                _anchor = DateTime.now();
                _picked = _key(_anchor);
              });
              _load();
            },
            child: Text('Today', style: T.body(12, color: T.brandInk, weight: FontWeight.w700)),
          ),
          const SizedBox(width: 4),
          _square(Icons.chevron_right_rounded, 'Next month', () {
            setState(() => _anchor = DateTime(_anchor.year, _anchor.month + 1, 1));
            _load();
          }),
        ]),
      );

  Widget _square(IconData icon, String tip, VoidCallback onTap) => Tooltip(
        // A tooltip rather than a bare semantics label: it reads out the same
        // way and a long press shows it, which is how somebody works out what
        // an unlabelled arrow does.
        message: tip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(9),
          // 44px, so it can be hit with a thumb on a ladder.
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: T.surface,
                border: Border.all(color: T.border),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(icon, size: 19, color: T.ink),
            ),
          ),
        ),
      );

  Widget _chips() {
    final counts = <String, int>{};
    for (final i in _items) {
      counts[i['kind'] as String] = (counts[i['kind'] as String] ?? 0) + 1;
    }
    final kinds = counts.keys.toList()..sort();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          _chip('All', _items.length, _kinds.isEmpty, null, () => setState(_kinds.clear)),
          for (final k in kinds)
            _chip(_labels[k] ?? k, counts[k]!, _kinds.contains(k), _tone[_toneOf(k)], () {
              setState(() => _kinds.contains(k) ? _kinds.remove(k) : _kinds.add(k));
            }),
        ]),
      ),
    );
  }

  String _toneOf(String kind) =>
      _items.firstWhere((i) => i['kind'] == kind, orElse: () => const {'tone': 'slate'})['tone']
          as String;

  Widget _chip(String label, int count, bool on, Color? dot, VoidCallback tap) => Padding(
        padding: const EdgeInsets.only(right: 6),
        child: InkWell(
          onTap: tap,
          borderRadius: BorderRadius.circular(99),
          child: Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 11),
            decoration: BoxDecoration(
              color: on ? T.navy : T.surface,
              border: Border.all(color: on ? T.navy : T.border),
              borderRadius: BorderRadius.circular(99),
            ),
            child: Row(children: [
              if (dot != null && !on) ...[
                Container(width: 6, height: 6, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                const SizedBox(width: 5),
              ],
              Text(label,
                  style: T.body(11.5,
                      color: on ? Colors.white : T.ink, weight: on ? FontWeight.w700 : FontWeight.w600)),
              const SizedBox(width: 4),
              Text('$count',
                  style: T.numeric(11.5,
                      color: on ? Colors.white70 : T.muted, weight: FontWeight.w600)),
            ]),
          ),
        ),
      );

  Widget _month() {
    final today = _key(DateTime.fromMillisecondsSinceEpoch(_nowMs));
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 11, 16, 0),
      padding: const EdgeInsets.fromLTRB(7, 8, 7, 9),
      decoration: BoxDecoration(
        color: T.surface,
        border: Border.all(color: T.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: [
        Row(
          children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
              .map((d) => Expanded(
                    child: Center(
                      child: Text(d, style: T.eyebrow.copyWith(fontSize: 10, color: T.faint)),
                    ),
                  ))
              .toList(),
        ),
        const SizedBox(height: 3),
        for (var week = 0; week * 7 < _grid.length; week++)
          Row(
            children: List.generate(7, (i) {
              final index = week * 7 + i;
              if (index >= _grid.length) return const Expanded(child: SizedBox());
              final day = _grid[index];
              return Expanded(child: _square2(day, today));
            }),
          ),
      ]),
    );
  }

  Widget _square2(String day, String today) {
    final inMonth = day.startsWith(
        '${_anchor.year}-${_anchor.month.toString().padLeft(2, "0")}');
    final items = _onDay(day);
    final isToday = day == today;
    final isPicked = day == _picked;
    final number = int.parse(day.split('-').last);

    return Semantics(
      button: true,
      selected: isPicked,
      label: '$number, ${items.length} item${items.length == 1 ? "" : "s"}',
      child: InkWell(
        key: Key('day-$day'),
        onTap: () => setState(() => _picked = day),
        borderRadius: BorderRadius.circular(9),
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isPicked ? T.navy : (isToday ? T.brandBg : null),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '$number',
                style: T.numeric(12.5,
                    color: isPicked
                        ? Colors.white
                        : inMonth
                            ? T.ink
                            : const Color(0xFFB9BED6),
                    weight: isToday || isPicked ? FontWeight.w800 : FontWeight.w600),
              ),
              const SizedBox(height: 2),
              SizedBox(
                height: 5,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: items.take(3).map((i) {
                    final c = _tone[i['tone']] ?? T.muted;
                    return Container(
                      width: 4,
                      height: 4,
                      margin: const EdgeInsets.symmetric(horizontal: 1),
                      decoration: BoxDecoration(
                        color: isPicked ? Colors.white : c,
                        shape: BoxShape.circle,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _day(String day) {
    final items = _onDay(day);
    final d = DateTime.parse(day);
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    final overdue = items.where(_isOverdue).length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${weekdays[d.weekday - 1]}, ${d.day} ${months[d.month - 1]}',
                style: T.heading(13.5)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                items.isEmpty
                    ? 'Nothing on this day'
                    : '${items.length} on this day${overdue > 0 ? " · $overdue overdue" : ""}',
                style: T.numeric(11.5, color: T.muted),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('Nothing is due, scheduled or waiting on you.',
                  style: T.body(13, color: T.muted)),
            ),
          for (final i in items) _row(i),
        ],
      ),
    );
  }

  Widget _row(Map<String, dynamic> i) {
    final late = _isOverdue(i);
    final waiting = i['needsResponse'] == true;
    final at = DateTime.parse(i['at'] as String).toLocal();
    final time = i['allDay'] == true
        ? 'All day'
        : '${at.hour.toString().padLeft(2, "0")}:${at.minute.toString().padLeft(2, "0")}';

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          margin: const EdgeInsets.only(top: 6),
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: _tone[i['tone']] ?? T.muted, shape: BoxShape.circle),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${i['title']}', style: T.body(13, color: T.navy, weight: FontWeight.w700)),
            const SizedBox(height: 1),
            Text(
              [time, _labels[i['kind']] ?? i['kind'], i['subtitle']]
                  .where((p) => p != null && '$p'.isNotEmpty)
                  .join(' · '),
              style: T.numeric(11.5, color: T.muted, weight: FontWeight.w500),
            ),
          ]),
        ),
        if (late) _pill('Overdue', T.badBg, T.bad, 'overdue-pill'),
        if (waiting) _pill('Accept?', T.plumBg, T.plum, 'accept-pill'),
      ]),
    );
  }

  /// Keyed, because the metric band also has a card called "Overdue" — the
  /// pill is the one on the row.
  Widget _pill(String text, Color bg, Color ink, String key) => Container(
        key: Key(key),
        margin: const EdgeInsets.only(left: 6),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: T.body(10, color: ink, weight: FontWeight.w800)),
      );
}
