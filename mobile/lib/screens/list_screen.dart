import 'package:flutter/material.dart';

import '../api.dart';
import '../modules.dart';
import '../session.dart';
import '../theme.dart';

/// One screen for all twenty-four lists.
///
/// The boundary returns `columns` with the rows, so there is nothing per-module
/// to write: the server decides what a list contains, which columns it has and
/// what the current filters amount to in words — the same decisions the web
/// screen makes, because it is the same query. A column the viewer may not see
/// never arrives, so there is no hiding to do here either.
class ListScreen extends StatefulWidget {
  const ListScreen({
    super.key,
    required this.api,
    required this.session,
    required this.module,
  });

  final Api api;
  final Session session;
  final Module module;

  @override
  State<ListScreen> createState() => ListScreenState();
}

class ListScreenState extends State<ListScreen> {
  bool _loading = true;
  String? _error;
  String _title = '';
  String _filters = '';
  List<Map<String, dynamic>> _columns = const [];
  List<Map<String, dynamic>> _rows = const [];
  List<Map<String, dynamic>> _summary = const [];

  /// What the filter sheet has set. The keys are the web's own query parameters.
  final Map<String, String> _query = {};
  final _search = TextEditingController();
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await widget.api.get('/list/${widget.module.list}', query: _query);
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
      _title = (d['title'] as String?) ?? widget.module.label;
      _filters = (d['filters'] as String?) ?? '';
      _columns = ((d['columns'] as List?) ?? const []).cast<Map<String, dynamic>>();
      _rows = ((d['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
      _summary = ((d['summary'] as List?) ?? const []).cast<Map<String, dynamic>>();
    });
  }

  void _setFilter(String key, String? value) {
    setState(() {
      if (value == null || value.isEmpty) {
        _query.remove(key);
      } else {
        _query[key] = value;
      }
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        title: _searching
            ? TextField(
                key: const Key('search'),
                controller: _search,
                autofocus: true,
                style: T.body(16, color: Colors.white),
                cursorColor: Colors.white,
                decoration: InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Search ${widget.module.label.toLowerCase()}',
                  hintStyle: T.body(16, color: const Color(0xFF9BA1C2)),
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: (v) => _setFilter('q', v),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _title.isEmpty ? widget.module.label : _title,
                    style: T.heading(18, color: Colors.white),
                  ),
                  if (!_loading)
                    Text(
                      '${_rows.length} ${_rows.length == 1 ? "row" : "rows"}',
                      style: T.numeric(11, color: const Color(0xFF9BA1C2), weight: FontWeight.w700),
                    ),
                ],
              ),
        actions: [
          IconButton(
            key: const Key('search-toggle'),
            tooltip: _searching ? 'Close search' : 'Search',
            icon: Icon(_searching ? Icons.close_rounded : Icons.search_rounded),
            onPressed: () {
              setState(() => _searching = !_searching);
              if (!_searching && _query.containsKey('q')) {
                _search.clear();
                _setFilter('q', null);
              }
            },
          ),
          IconButton(
            key: const Key('filter'),
            tooltip: 'Filter',
            icon: Badge(
              isLabelVisible: _query.keys.where((k) => k != 'q').isNotEmpty,
              backgroundColor: T.brand,
              child: const Icon(Icons.filter_list_rounded),
            ),
            onPressed: _openFilters,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [_ErrorCard(message: _error!, onRetry: _load)],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: _rows.length + 1,
      itemBuilder: (context, i) {
        if (i == 0) return _Band(summary: _summary, filters: _filters, chips: _activeChips());
        final row = _rows[i - 1];
        return _RowCard(columns: _columns, row: row);
      },
    );
  }

  List<Widget> _activeChips() => _query.entries
      .map((e) => Padding(
            padding: const EdgeInsets.only(right: 6),
            child: InputChip(
              label: Text('${e.key}: ${e.value}', style: T.body(11.5, weight: FontWeight.w600)),
              onDeleted: () => _setFilter(e.key, null),
              backgroundColor: T.surface,
              side: const BorderSide(color: T.border),
              // Named, so it can be reached by a screen reader and by a test.
              deleteIcon: const Icon(Icons.close_rounded, size: 16),
              deleteIconColor: T.muted,
              deleteButtonTooltipMessage: 'Remove ${e.key} filter',
            ),
          ))
      .toList();

  /// The filter sheet.
  ///
  /// The parameters are the ones the web reads from its own URL, so the two
  /// agree without either knowing about the other. Status is offered as free
  /// text because the server describes what it applied — `filters` comes back
  /// in words, and that is what the band shows.
  void _openFilters() {
    final status = TextEditingController(text: _query['status'] ?? '');
    final from = TextEditingController(text: _query['from'] ?? '');
    final to = TextEditingController(text: _query['to'] ?? '');

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: T.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(16, 14, 16, MediaQuery.of(sheet).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: T.borderStrong,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text('Filter ${widget.module.label}', style: T.heading(17)),
            const SizedBox(height: 14),
            _sheetField('Status', status, 'e.g. DRAFT'),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _sheetField('From', from, 'yyyy-mm-dd')),
              const SizedBox(width: 10),
              Expanded(child: _sheetField('To', to, 'yyyy-mm-dd')),
            ]),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pop(sheet);
                    setState(() => _query.removeWhere((k, _) => k != 'q'));
                    _load();
                  },
                  child: Text('Clear', style: T.body(14, weight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  key: const Key('apply-filters'),
                  style: FilledButton.styleFrom(backgroundColor: T.brand),
                  onPressed: () {
                    Navigator.pop(sheet);
                    setState(() {
                      for (final e in {
                        'status': status.text,
                        'from': from.text,
                        'to': to.text,
                      }.entries) {
                        if (e.value.trim().isEmpty) {
                          _query.remove(e.key);
                        } else {
                          _query[e.key] = e.value.trim();
                        }
                      }
                    });
                    _load();
                  },
                  child: Text('Apply', style: T.body(14, color: Colors.white, weight: FontWeight.w700)),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _sheetField(String label, TextEditingController c, String hint) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: T.eyebrow),
          const SizedBox(height: 5),
          TextField(
            controller: c,
            style: T.body(14),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: T.body(14, color: T.faint),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: T.borderStrong),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: T.borderStrong),
              ),
            ),
          ),
        ],
      );
}

/// The metric band, plus what the rows were narrowed to — in the server's words.
class _Band extends StatelessWidget {
  const _Band({required this.summary, required this.filters, required this.chips});

  final List<Map<String, dynamic>> summary;
  final String filters;
  final List<Widget> chips;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (summary.isNotEmpty)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: summary
                    .map((s) => Container(
                          width: 118,
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
                          decoration: BoxDecoration(
                            color: T.surface,
                            border: Border.all(color: T.border),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${s['value'] ?? ''}',
                                  style: T.heading(19, weight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text('${s['label'] ?? ''}',
                                  style: T.body(10.5, color: T.muted, weight: FontWeight.w600)),
                            ],
                          ),
                        ))
                    .toList(),
              ),
            ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: chips),
            ),
          ],
          if (filters.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(filters, style: T.body(11.5, color: T.muted)),
          ],
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

/// One record. The first column is the heading, the rest are its fields —
/// which is what a list row looks like on a phone rather than a table.
class _RowCard extends StatelessWidget {
  const _RowCard({required this.columns, required this.row});

  final List<Map<String, dynamic>> columns;
  final Map<String, dynamic> row;

  bool _isNumeric(Map<String, dynamic> c) =>
      c['align'] == 'right' || c['format'] == 'number' || c['format'] == 'money';

  String _show(Map<String, dynamic> c) {
    final v = row[c['key']];
    if (v == null || v == '') return '—';
    if (c['format'] == 'money' && v is num) return money(v);
    if (c['format'] == 'date' && v is String && v.length >= 10) {
      final d = DateTime.tryParse(v);
      if (d != null) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return '${d.day.toString().padLeft(2, '0')} ${months[d.month - 1]} ${d.year}';
      }
    }
    return '$v';
  }

  @override
  Widget build(BuildContext context) {
    if (columns.isEmpty) return const SizedBox.shrink();
    final head = columns.first;
    final rest = columns.skip(1).toList();

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
      decoration: BoxDecoration(
        color: T.surface,
        border: Border.all(color: T.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_show(head), style: T.heading(14.5)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 7,
            children: rest.map((c) {
              return SizedBox(
                width: 150,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${c['header']}'.toUpperCase(), style: T.eyebrow.copyWith(fontSize: 9.5)),
                    const SizedBox(height: 1),
                    _isNumeric(c)
                        ? Text(_show(c), style: T.numeric(13))
                        : Text(_show(c), style: T.body(13, weight: FontWeight.w600)),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('list-error'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: T.badBg,
        border: Border.all(color: T.badLine),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The server's sentence, verbatim. It was written for this person.
          Text(message, style: T.body(13.5, color: T.bad, weight: FontWeight.w600)),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: onRetry, child: Text('Try again', style: T.body(13, weight: FontWeight.w700))),
        ],
      ),
    );
  }
}
