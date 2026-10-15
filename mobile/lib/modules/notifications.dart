import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/nav.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'record_screen.dart';

/// What needs this person.
///
/// The web has had this screen all along and the app had neither it nor any
/// way to read one: notifications have no export route, so the list endpoints
/// could not carry them, and `/notifications` had to be added to the boundary
/// for this screen to exist at all.
///
/// Every row carries the route the web would open, so tapping one lands on the
/// record it is about — a declined calendar task, an overdue task, an approval
/// that is waiting — and marks it read on the way, as the web's link does.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    super.key,
    required this.api,
    required this.onBack,
    required this.bottom,
    this.onCount,
  });

  final Api api;
  final VoidCallback onBack;
  final Widget bottom;

  /// Tells the shell how many are unread, for the badge.
  final void Function(int)? onCount;

  @override
  State<NotificationsScreen> createState() => NotificationsScreenState();
}

class NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  String? _error;
  String? _code;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await widget.api.get('/notifications');
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok) {
        _data = res.data;
      } else {
        _error = res.error;
        _code = res.code;
      }
    });
    if (res.ok) widget.onCount?.call((res.data!['unread'] as num?)?.toInt() ?? 0);
  }

  List<Map<String, dynamic>> get _rows =>
      ((_data?['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();

  int get _unread => (_data?['unread'] as num?)?.toInt() ?? 0;

  Future<void> _markOne(String id) async {
    final res = await widget.api.run('notifications/markNotificationRead', [id]);
    if (!mounted) return;
    if (!res.ok) {
      notify(context, res.error ?? 'That did not work.');
      return;
    }
    await load();
  }

  Future<void> _markAll() async {
    final messenger = ScaffoldMessenger.of(context);
    final res = await widget.api.run('notifications/markAllNotificationsRead', []);
    if (!mounted) return;
    if (!res.ok) {
      notify(context, res.error ?? 'That did not work.');
      return;
    }
    await load();
    messenger.showSnackBar(SnackBar(
      backgroundColor: T.navy950,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(T.gutter),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      content: Text('All marked read.',
          style: T.body(color: Colors.white, weight: FontWeight.w500).copyWith(fontSize: 13.5)),
    ));
  }

  /// Tapping one opens what it is about, and marks it read on the way.
  Future<void> _open(Map<String, dynamic> n) async {
    final target = recordFor('${n["href"] ?? ""}');
    if (n['read'] != true) await _markOne('${n["id"]}');
    if (target == null || !mounted) return;

    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => RecordScreen(
        api: widget.api,
        module: target.module,
        id: target.id,
        fallbackTitle: '${n["title"]}',
      ),
    ));
    if (changed == true) await load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;

    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: 'Notifications',
          subtitle: _loading
              ? 'Loading…'
              : '$_unread unread · ${rows.length} total',
          onBack: widget.onBack,
          actions: [
            if (_unread > 0)
              BarButton(
                icon: Icons.done_all_rounded,
                label: 'Mark all read',
                onTap: _markAll,
              ),
            BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: load),
          ],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(strokeWidth: 2.2))
              : _error != null
                  ? ListView(
                      padding: const EdgeInsets.all(T.gutter),
                      children: [
                        Alert(_error!, detail: _code == null ? null : 'Refused by $_code'),
                        const SizedBox(height: 12),
                        Btn('Try again', emphasis: Emphasis.outline, onPressed: load),
                      ],
                    )
                  : rows.isEmpty
                      ? const Empty(
                          'Nothing needs you',
                          detail:
                              'Escalations and anything addressed to you appear here. Only you see these.',
                        )
                      : RefreshIndicator(
                          onRefresh: load,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 24),
                            itemCount: rows.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 9),
                            itemBuilder: (_, i) => _Row(
                              row: rows[i],
                              onOpen: () => _open(rows[i]),
                              onMarkRead: () => _markOne('${rows[i]["id"]}'),
                            ),
                          ),
                        ),
        ),
        widget.bottom,
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row, required this.onOpen, required this.onMarkRead});

  final Map<String, dynamic> row;
  final VoidCallback onOpen;
  final VoidCallback onMarkRead;

  @override
  Widget build(BuildContext context) {
    final read = row['read'] == true;
    final opens = recordFor('${row["href"] ?? ""}') != null;

    return Panel(
      // An unread one is bordered, as the web tints it.
      border: read ? T.line : T.brand500,
      fill: read ? T.card : T.brand100,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      onTap: opens ? onOpen : (read ? null : onMarkRead),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            margin: const EdgeInsets.only(top: 5),
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: read ? T.line400 : T.brand500,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text('${row["title"]}',
                style: T.rowTitle().copyWith(fontSize: 14.5),
                maxLines: 3),
          ),
          if (!read) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onMarkRead,
              child: Text('Mark read',
                  style: T.caption(color: T.brand700).copyWith(fontWeight: FontWeight.w700)),
            ),
          ],
        ]),
        if (row['body'] != null && '${row["body"]}'.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 17, top: 4),
            child: Text('${row["body"]}', style: T.secondaryText()),
          ),
        Padding(
          padding: const EdgeInsets.only(left: 17, top: 6),
          child: Row(children: [
            KindTag(_words('${row["kind"]}'), tone: _tone('${row["kind"]}')),
            const SizedBox(width: 8),
            Text(shortDate(row['createdAt']),
                style: T.num(11.5, color: T.muted, weight: FontWeight.w500)),
          ]),
        ),
      ]),
    );
  }

  String _words(String kind) => kind.replaceAll('_', ' ').toLowerCase();

  /// The same reading the rest of the app gives a word: a refusal is red, a
  /// decision taken is green, something waiting is amber.
  Tone _tone(String kind) {
    final k = kind.toUpperCase();
    if (k.contains('REJECT') || k.contains('DECLINE') || k.contains('OVERDUE') ||
        k.contains('CANCEL') || k.contains('BOUNCE')) {
      return Tone.bad;
    }
    if (k.contains('APPROVE') || k.contains('ACCEPT') || k.contains('COMPLET') ||
        k.contains('GRANT') || k.contains('PAID')) {
      return Tone.good;
    }
    if (k.contains('EXTEND') || k.contains('ESCALAT') || k.contains('PENDING')) {
      return Tone.warn;
    }
    return Tone.info;
  }
}
