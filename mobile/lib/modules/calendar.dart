import 'package:flutter/material.dart';

import '../core/act.dart';
import '../core/api.dart';
import '../core/nav.dart';
import '../core/session.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'form_screen.dart';
import 'record_screen.dart';

/// Every dated thing in the system, on one grid.
///
/// The grid comes from the server — always six weeks, so the panel below never
/// changes height — and so does `serverTime`. Nothing here reads the phone's
/// clock: a handset with the wrong time must not disagree with the web about
/// what is overdue.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onBack,
    required this.bottom,
  });

  final Api api;
  final Session session;
  final VoidCallback onBack;
  final Widget bottom;

  @override
  State<CalendarScreen> createState() => CalendarScreenState();
}

/// What each kind is called, where the server has not said.
///
/// The boundary sends `kindLabels` — one list, the web's own — and this is only
/// the fallback for an older build talking to a newer server. It used to be
/// the app's own idea of the seven words, which is how the schedule's items
/// came to read "Activity" here and "Schedule" on the web.
const _kindLabelFallback = {
  'EVENT': 'Calendar', 'INVITE': 'Invitation', 'TASK': 'Task',
  'FOLLOW_UP': 'Follow-up', 'SITE_VISIT': 'Site visit', 'APPROVAL': 'Approval',
  'ACTIVITY': 'Schedule',
};

const _toneOfKind = {
  'EVENT': Tone.info, 'INVITE': Tone.plum, 'TASK': Tone.warn,
  'FOLLOW_UP': Tone.info, 'SITE_VISIT': Tone.good, 'APPROVAL': Tone.bad,
  'ACTIVITY': Tone.draft,
};

/// Past its moment and still waiting on somebody. A meeting that has finished
/// is not overdue — it happened.
const _waits = {'TASK', 'FOLLOW_UP', 'SITE_VISIT', 'APPROVAL', 'INVITE'};

class CalendarScreenState extends State<CalendarScreen> {
  bool _loading = true;
  String? _error;
  List<String> _grid = const [];
  List<Map<String, dynamic>> _items = const [];
  int _nowMs = 0;
  DateTime _anchor = DateTime.now();
  String? _picked;
  final Set<String> _kinds = {};

  /// What each kind is called, as the boundary sends it.
  Map<String, String> _kindLabel = _kindLabelFallback;

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
    final res = await widget.api
        .get('/calendar', query: {'view': 'month', 'on': _key(_anchor)});
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
      _nowMs = DateTime.parse(d['serverTime'] as String).millisecondsSinceEpoch;
      final labels = d['kindLabels'] as Map<String, dynamic>?;
      if (labels != null && labels.isNotEmpty) {
        _kindLabel = labels.map((k, v) => MapEntry(k, '$v'));
      }
      _picked ??= _key(DateTime.fromMillisecondsSinceEpoch(_nowMs));
    });
  }

  /// Every day an item touches, so a span shows on each square it crosses.
  List<String> _daysOf(Map<String, dynamic> i) {
    final from = DateTime.parse(i['at'] as String).toLocal();
    final endRaw = i['endAt'] as String?;
    final to = endRaw == null ? from : DateTime.parse(endRaw).toLocal();
    if (to.isBefore(from)) return [_key(from)];
    final out = <String>[];
    var c = DateTime(from.year, from.month, from.day);
    final last = DateTime(to.year, to.month, to.day);
    while (!c.isAfter(last) && out.length < 60) {
      out.add(_key(c));
      c = c.add(const Duration(days: 1));
    }
    return out;
  }

  bool _late(Map<String, dynamic> i) {
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
      return at != 0 ? at : '${a["title"]}'.compareTo('${b["title"]}');
    });
    return out;
  }

  @override
  Widget build(BuildContext context) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    final shown = _shown;
    final overdue = shown.where(_late).length;
    final waiting = shown.where((i) => i['needsResponse'] == true).length;

    return Scaffold(
      backgroundColor: T.page,
      floatingActionButton: widget.session.can('calendar.event.create')
          ? Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FloatingActionButton(
                onPressed: _newTask,
                backgroundColor: T.brand500,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                tooltip: 'New calendar task',
                child: const Icon(Icons.add_rounded, size: 26, color: Colors.white),
              ),
            )
          : null,
      body: Column(children: [
        Bar(
          title: 'Calendar',
          subtitle: _loading
              ? 'Loading…'
              : '${months[_anchor.month - 1]} ${_anchor.year} · ${shown.length} on this view',
          onBack: widget.onBack,
          actions: [
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load),
          ],
        ),
        if (!_loading && _error == null)
          Band([
            Figure('${shown.length}', 'On this view'),
            Figure('$waiting', 'Waiting on you', tone: waiting > 0 ? Tone.plum : null),
            Figure('$overdue', 'Overdue', tone: overdue > 0 ? Tone.bad : null),
          ]),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? ListView(padding: const EdgeInsets.all(T.gutter), children: [
                        Alert(_error!),
                        const SizedBox(height: 12),
                        Btn('Try again',
                            emphasis: Emphasis.outline, expand: true, onPressed: _load),
                      ])
                    : ListView(
                        padding: const EdgeInsets.only(bottom: 90),
                        children: [
                          _monthBar(months[_anchor.month - 1]),
                          _chips(),
                          if (_grid.isNotEmpty) _month(),
                          if (_picked != null) _day(_picked!),
                        ],
                      ),
          ),
        ),
        widget.bottom,
      ]),
    );
  }

  Widget _monthBar(String month) => Padding(
        padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 0),
        child: Row(children: [
          BarMonthButton(
            icon: Icons.chevron_left_rounded,
            label: 'Previous month',
            onTap: () {
              setState(() => _anchor = DateTime(_anchor.year, _anchor.month - 1, 1));
              _load();
            },
          ),
          const SizedBox(width: 4),
          Expanded(child: Text('$month ${_anchor.year}', style: T.section())),
          Btn('Today',
              emphasis: Emphasis.text,
              height: T.target,
              onPressed: () {
                setState(() {
                  _anchor = DateTime.now();
                  _picked = _key(_anchor);
                });
                _load();
              }),
          BarMonthButton(
            icon: Icons.chevron_right_rounded,
            label: 'Next month',
            onTap: () {
              setState(() => _anchor = DateTime(_anchor.year, _anchor.month + 1, 1));
              _load();
            },
          ),
        ]),
      );

  Widget _chips() {
    final counts = <String, int>{};
    for (final i in _items) {
      counts['${i["kind"]}'] = (counts['${i["kind"]}'] ?? 0) + 1;
    }
    final kinds = counts.keys.toList()..sort();
    return Chips([
      FilterChip2(
        label: 'All',
        count: _items.length,
        selected: _kinds.isEmpty,
        onTap: () => setState(_kinds.clear),
      ),
      for (final k in kinds)
        FilterChip2(
          label: _kindLabel[k] ?? k,
          count: counts[k],
          selected: _kinds.contains(k),
          onTap: () => setState(() => _kinds.contains(k) ? _kinds.remove(k) : _kinds.add(k)),
        ),
    ], top: 10);
  }

  Widget _month() {
    final today = _key(DateTime.fromMillisecondsSinceEpoch(_nowMs));
    return Container(
      margin: const EdgeInsets.fromLTRB(T.gutter, 11, T.gutter, 0),
      padding: const EdgeInsets.fromLTRB(7, 8, 7, 9),
      decoration: BoxDecoration(
        color: T.card,
        border: Border.all(color: T.line),
        borderRadius: BorderRadius.circular(T.rCard),
      ),
      child: Column(children: [
        Row(
          children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
              .map((d) => Expanded(
                    child: Center(child: Text(d, style: T.overline(color: T.faint))),
                  ))
              .toList(),
        ),
        const SizedBox(height: 3),
        for (var w = 0; w * 7 < _grid.length; w++)
          Row(
            children: List.generate(7, (i) {
              final idx = w * 7 + i;
              if (idx >= _grid.length) return const Expanded(child: SizedBox());
              return Expanded(child: _square(_grid[idx], today));
            }),
          ),
      ]),
    );
  }

  Widget _square(String day, String today) {
    final inMonth =
        day.startsWith('${_anchor.year}-${_anchor.month.toString().padLeft(2, "0")}');
    final items = _onDay(day);
    final isToday = day == today;
    final picked = day == _picked;
    final n = int.parse(day.split('-').last);

    return Semantics(
      button: true,
      selected: picked,
      label: '$n, ${items.length} item${items.length == 1 ? "" : "s"}',
      child: InkWell(
        key: Key('day-$day'),
        onTap: () => setState(() => _picked = day),
        borderRadius: BorderRadius.circular(T.rControl),
        child: Container(
          height: T.target,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: picked ? T.navy950 : (isToday ? T.brand100 : null),
            borderRadius: BorderRadius.circular(T.rControl),
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('$n',
                style: T.num(12.5,
                    color: picked
                        ? Colors.white
                        : inMonth
                            ? T.ink
                            : T.chevron,
                    weight: isToday || picked ? FontWeight.w800 : FontWeight.w600)),
            const SizedBox(height: 2),
            SizedBox(
              height: 5,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: items.take(3).map((i) {
                  final c = toneOf(_toneOfKind['${i["kind"]}'] ?? Tone.draft);
                  return Container(
                    width: 4,
                    height: 4,
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    decoration: BoxDecoration(
                      color: picked ? Colors.white : c.ink,
                      shape: BoxShape.circle,
                    ),
                  );
                }).toList(),
              ),
            ),
          ]),
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
    final overdue = items.where(_late).length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(T.gutter, 14, T.gutter, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${weekdays[d.weekday - 1]}, ${d.day} ${months[d.month - 1]}',
              style: T.section().copyWith(fontSize: 13.5)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              items.isEmpty
                  ? ''
                  : '${items.length} on this day${overdue > 0 ? " · $overdue overdue" : ""}',
              style: T.num(11.5, color: T.muted, weight: FontWeight.w500),
            ),
          ),
        ]),
        const SizedBox(height: 9),
        if (items.isEmpty)
          const Empty('Nothing on this day',
              detail: 'Nothing is due, scheduled or waiting on you.')
        else
          for (final i in items) ...[
            _AgendaRow(
              kindLabel: _kindLabel,
              item: i,
              late: _late(i),
              api: widget.api,
              session: widget.session,
              onChanged: _load,
            ),
            const SizedBox(height: 8),
          ],
      ]),
    );
  }

  /// Raising one. The form is the web's own — all nine fields of it, including
  /// the people it goes on, who are invited rather than told.
  Future<void> _newTask() async {
    final made = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => FormScreen(api: widget.api, formKey: 'calendar:create'),
    ));
    if (made == true) await _load();
  }
}

/// The month arrows: a 34dp square inside a 48dp target.
class BarMonthButton extends StatelessWidget {
  const BarMonthButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(T.rControl),
          child: SizedBox(
            width: T.target,
            height: T.target,
            child: Center(
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: T.card,
                  border: Border.all(color: T.line),
                  borderRadius: BorderRadius.circular(T.rControl),
                ),
                child: Icon(icon, size: 19, color: T.ink),
              ),
            ),
          ),
        ),
      );
}

class _AgendaRow extends StatelessWidget {
  const _AgendaRow({
    required this.item,
    required this.late,
    required this.kindLabel,
    required this.api,
    required this.session,
    required this.onChanged,
  });

  final Map<String, dynamic> item;
  final bool late;

  /// What each kind is called, as the boundary sent it.
  final Map<String, String> kindLabel;
  final Api api;
  final Session session;
  final Future<void> Function() onChanged;

  /// The calendar task's own id, with the "event:" prefix the agenda adds.
  String get _eventId => '${item["id"]}'.replaceFirst('event:', '');

  @override
  Widget build(BuildContext context) {
    final at = DateTime.parse(item['at'] as String).toLocal();
    final time = item['allDay'] == true
        ? 'All day'
        : '${at.hour.toString().padLeft(2, "0")}:${at.minute.toString().padLeft(2, "0")}';
    final tone = _toneOfKind['${item["kind"]}'] ?? Tone.draft;
    final waiting = item['needsResponse'] == true;

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      border: waiting ? T.plumLine : (late ? T.badLine : T.line),
      onTap: recordFor('${item["href"]}') == null ? null : () => _open(context),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: toneOf(tone).ink, shape: BoxShape.circle),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text('${item["title"]}',
                style: T.rowTitle().copyWith(fontSize: 15),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
          if (late) ...[const SizedBox(width: 6), const Pill('Overdue', tone: Tone.bad, compact: true)],
          if (waiting) ...[const SizedBox(width: 6), const Pill('Accept?', tone: Tone.plum, compact: true)],
        ]),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 17),
          child: Text(
            [time, kindLabel['${item["kind"]}'] ?? item['kind'], item['subtitle']]
                .where((p) => p != null && '$p'.isNotEmpty)
                .join(' · '),
            style: T.num(11.5, color: T.muted, weight: FontWeight.w500),
          ),
        ),
        if (item['movedFrom'] != null)
          Padding(
            padding: const EdgeInsets.only(left: 17, top: 6),
            child: Text(
              'Was due to end ${shortDate(item["movedFrom"])}'
              '${(item["extendedCount"] as num? ?? 0) > 0 ? " · moved ${item["extendedCount"]} time${item["extendedCount"] == 1 ? "" : "s"}" : ""}',
              style: T.caption(color: T.warnInk).copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        if (waiting && session.can('calendar.event.respond'))
          Padding(
            padding: const EdgeInsets.only(top: 11),
            child: Row(children: [
              Expanded(
                child: Btn('Decline',
                    emphasis: Emphasis.reject,
                    height: 44,
                    expand: true,
                    onPressed: () => _respond(context, accept: false)),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: Btn('Accept',
                    emphasis: Emphasis.approve,
                    height: 44,
                    expand: true,
                    onPressed: () => _respond(context, accept: true)),
              ),
            ]),
          ),
      ]),
    );
  }

  Future<void> _respond(BuildContext context, {required bool accept}) async {
    final ok = await confirmAndRun(
      context,
      api,
      Act(
        action: 'calendar/respondToCalendarTask',
        args: [_eventId, accept],
        label: accept ? 'Accept' : 'Decline',
        title: accept ? 'Accept this task' : 'Decline this task',
        explain: accept
            ? 'It becomes yours, and whoever raised it is told.'
            : 'It comes off your calendar and whoever raised it sees your reason, '
                'so they can put it on somebody else.',
        emphasis: accept ? Emphasis.approve : Emphasis.reject,
        remark: accept ? RemarkMode.optional : RemarkMode.required,
        remarkLabel: accept ? 'Remark' : 'Why',
        done: accept ? 'Accepted — it is on your calendar.' : 'Declined.',
      ),
    );
    if (ok) await onChanged();
  }

  /// Opening whatever the row stands for.
  ///
  /// Every agenda row carries the route the web would open — a calendar task,
  /// a task, an indent, a purchase order — and that names the record behind
  /// it. So the calendar is a way into all of them rather than a list of
  /// things that cannot be touched, and the actions on each come from the
  /// record itself: complete, extend with its new finish, cancel, and for a
  /// task its checklist.
  Future<void> _open(BuildContext context) async {
    final target = recordFor('${item["href"]}');
    if (target == null) return;

    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => RecordScreen(
        api: api,
        module: target.module,
        id: target.id,
        fallbackTitle: '${item["title"]}',
      ),
    ));
    if (changed == true) await onChanged();
  }
}
