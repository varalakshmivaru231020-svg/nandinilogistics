import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/row.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import 'module_screen.dart';

/// One report from `/report/<key>` — the TL report, the tele-caller's daily
/// summary. Its rows are read off its columns, as the web's report table reads
/// them; they open nothing.
class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.api, required this.reportKey, required this.title});

  final Api api;
  final String reportKey;
  final String title;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final res = await widget.api.get('/report/${widget.reportKey}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = res.ok ? null : (res.missing ? notOnServer : res.error);
      _data = res.data;
    });
  }

  @override
  Widget build(BuildContext context) {
    final columns = ((_data?['columns'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final rows = ((_data?['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return Scaffold(
      backgroundColor: T.page,
      body: Column(children: [
        Bar(
          title: (_data?['label'] as String?) ?? widget.title,
          subtitle: _loading ? 'Loading…' : '${rows.length} rows',
          onBack: () => Navigator.maybePop(context),
          actions: [BarButton(icon: Icons.refresh_rounded, label: 'Reload', onTap: _load)],
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Padding(
                      padding: const EdgeInsets.all(T.gutter),
                      child: Alert(_error!, tone: Tone.warn))
                  : rows.isEmpty
                      ? Empty('${_data?["emptyMessage"] ?? "Nothing to report yet."}')
                      : ListView.separated(
                          padding: const EdgeInsets.all(T.gutter),
                          itemCount: rows.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (_, i) => ServerRowCard(
                            drawn: ServerRow.fromColumns(columns, rows[i]),
                            row: rows[i],
                            moduleKey: 'report/${widget.reportKey}',
                            api: widget.api,
                            onChanged: _load,
                          ),
                        ),
        ),
      ]),
    );
  }
}
