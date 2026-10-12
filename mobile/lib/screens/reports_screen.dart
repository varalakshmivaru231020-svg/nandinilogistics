import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';

/// The reports this person may run — the server filters the catalogue, so
/// every row here works when tapped.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.api, required this.session});

  final Api api;
  final Session session;

  @override
  State<ReportsScreen> createState() => ReportsScreenState();
}

class ReportsScreenState extends State<ReportsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _reports = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await widget.api.get('/reports');
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = res.ok ? null : res.error;
      _reports = res.ok
          ? ((res.data!['reports'] as List?) ?? const []).cast<Map<String, dynamic>>()
          : const [];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('ONLY WHAT YOU MAY RUN',
              style: T.eyebrow.copyWith(color: const Color(0xFF9BA1C2), fontSize: 9.5)),
          Text('Reports', style: T.heading(18, color: Colors.white)),
        ]),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: T.body(14, color: T.bad)))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  itemCount: _reports.length,
                  itemBuilder: (context, i) {
                    final r = _reports[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: T.surface,
                        border: Border.all(color: T.border),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ListTile(
                        key: Key('report-${r['key']}'),
                        title: Text('${r['label']}', style: T.body(14.5, weight: FontWeight.w700)),
                        subtitle: Text('${r['description']}', style: T.body(12, color: T.muted)),
                        trailing: const Icon(Icons.chevron_right_rounded, color: T.faint),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => _ReportScreen(api: widget.api, report: r),
                        )),
                      ),
                    );
                  },
                ),
    );
  }
}

class _ReportScreen extends StatefulWidget {
  const _ReportScreen({required this.api, required this.report});

  final Api api;
  final Map<String, dynamic> report;

  @override
  State<_ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<_ReportScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _columns = const [];
  List<Map<String, dynamic>> _rows = const [];
  List<Map<String, dynamic>> _summary = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await widget.api.get('/report/${widget.report['key']}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = res.ok ? null : res.error;
      if (res.ok) {
        _columns = ((res.data!['columns'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _rows = ((res.data!['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _summary = ((res.data!['summary'] as List?) ?? const []).cast<Map<String, dynamic>>();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(title: Text('${widget.report['label']}', style: T.heading(17, color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: T.body(14, color: T.bad)))
              : ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
                  for (final s in _summary)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Text('${s['label']}', style: T.body(12.5, color: T.muted, weight: FontWeight.w600)),
                        Text('${s['value']}', style: T.numeric(13, weight: FontWeight.w700)),
                      ]),
                    ),
                  const SizedBox(height: 8),
                  if (_rows.isEmpty)
                    Text('Nothing to show.', style: T.body(13.5, color: T.muted))
                  else
                    // Horizontal scroll, because a report is genuinely a table
                    // and squeezing eight columns into 390px would make it a
                    // worse table rather than a phone-shaped one.
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        headingTextStyle: T.eyebrow,
                        dataTextStyle: T.body(12.5),
                        columnSpacing: 22,
                        columns: _columns
                            .map((c) => DataColumn(label: Text('${c['header']}'.toUpperCase())))
                            .toList(),
                        rows: _rows
                            .take(200)
                            .map((r) => DataRow(
                                  cells: _columns
                                      .map((c) => DataCell(Text('${r[c['key']] ?? "—"}')))
                                      .toList(),
                                ))
                            .toList(),
                      ),
                    ),
                ]),
    );
  }
}
