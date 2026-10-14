
import '../design/components.dart';
import '../design/tokens.dart';

/// What one module is: its list, its figures, its filters, its row, and what
/// can be done to a record from it.
///
/// Written per module rather than derived from the server, because the design
/// gives each list its own band and its own row. What is shared is the *shape*
/// — the canvas draws one list pattern and reuses it, with the specifics
/// changing — so the specifics live here and the pattern lives in one screen.
class ModuleSpec {
  const ModuleSpec({
    required this.key,
    required this.title,
    required this.searchHint,
    required this.row,
    this.filters = const [],
    this.figures,
    this.chain,
    this.detail = const [],
    this.createLabel,
  });

  /// The boundary's list key, which is also the module key.
  final String key;
  final String title;

  /// What the search box says it will look in — the web's own search fields.
  final String searchHint;

  /// The filters the web toolbar has, with the panel's own options.
  final List<FilterSpec> filters;

  /// The band. Given the rows and the server's instant, returns up to four.
  final List<Figure> Function(List<Map<String, dynamic>> rows, int nowMs)? figures;

  /// How one record reads in the list.
  final RowSpec row;

  /// An approval chain, where the record has one.
  final List<ChainStep> Function(Map<String, dynamic> row)? chain;

  /// The fields a detail screen shows, in order.
  final List<DetailField> detail;

  /// The label on the FAB, where the module can be added to from the phone.
  final String? createLabel;
}

/// A filter, with the options the web offers for it.
class FilterSpec {
  const FilterSpec({
    required this.key,
    required this.label,
    this.options = const [],
    this.kind = FilterKind.choice,
  });

  /// The query parameter — the same one the web reads from its URL.
  final String key;
  final String label;

  /// (value, what the panel calls it). Empty for a date or a flag.
  final List<(String, String)> options;
  final FilterKind kind;
}

enum FilterKind { choice, date, flag }

/// How a record reads as a row: two lines, a trailing figure, a status and
/// whatever else the module puts beside it.
class RowSpec {
  const RowSpec({
    required this.title,
    required this.subtitle,
    this.trailing,
    this.status,
    this.statusTone,
    this.meta,
  });

  final String Function(Map<String, dynamic> row) title;
  final String Function(Map<String, dynamic> row) subtitle;

  /// The figure on the right — money, a quantity, a count.
  final String Function(Map<String, dynamic> row)? trailing;
  final String Function(Map<String, dynamic> row)? status;
  final Tone Function(Map<String, dynamic> row)? statusTone;

  /// The dim line under the status pill.
  final String Function(Map<String, dynamic> row, int nowMs)? meta;
}

class DetailField {
  const DetailField(this.label, this.read, {this.money = false, this.wide = false});
  final String label;
  final Object? Function(Map<String, dynamic> row) read;
  final bool money;

  /// A long value — remarks, an address — which gets a line of its own.
  final bool wide;
}

/* ------------------------------------------------------------------ helpers */

String _s(Map<String, dynamic> r, String k) {
  final v = r[k];
  return v == null ? '' : '$v';
}

String _first(Map<String, dynamic> r, List<String> keys, {String fallback = ''}) {
  for (final k in keys) {
    final v = _s(r, k);
    if (v.isNotEmpty) return v;
  }
  return fallback;
}

String _join(Map<String, dynamic> r, List<String> keys) =>
    keys.map((k) => _s(r, k)).where((v) => v.isNotEmpty).join(' · ');

/// The tone a status word carries, by what it means rather than by its module.
Tone toneOfStatus(String raw) {
  final s = raw.toUpperCase().replaceAll('_', ' ');
  if (s.contains('REJECT') || s.contains('CANCEL') || s.contains('MISMATCH') ||
      s.contains('DELAY') || s.contains('LOST') || s.contains('BLOCK')) {
    return Tone.bad;
  }
  if (s.contains('APPROVED') || s.contains('POSTED') || s.contains('PAID') ||
      s.contains('COMPLETED') || s.contains('CLOSED') || s.contains('RECEIVED') ||
      s.contains('MATCHED') || s.contains('REGISTERED') || s.contains('ACTIVE') ||
      s.contains('BOOKED') || s.contains('PUBLISHED')) {
    return Tone.good;
  }
  if (s.contains('PENDING') || s.contains('SUBMITTED') || s.contains('HOLD') ||
      s.contains('PROGRESS') || s.contains('PARTIAL') || s.contains('HELD') ||
      s.contains('REWORK') || s.contains('INSPECTED')) {
    return Tone.warn;
  }
  if (s.contains('REVIEW') || s.contains('NEGOTIATION') || s.contains('AGREEMENT')) {
    return Tone.plum;
  }
  if (s.contains('AVAILABLE') || s.contains('NEW') || s.contains('CONTACTED')) {
    return Tone.info;
  }
  return Tone.draft;
}

/// Counts rows whose named field matches any of the given words.
int countWhere(List<Map<String, dynamic>> rows, String field, List<String> words) => rows
    .where((r) => words.any((w) => _s(r, field).toUpperCase().replaceAll('_', ' ').contains(w)))
    .length;

num sumOf(List<Map<String, dynamic>> rows, String field) =>
    rows.fold<num>(0, (t, r) => t + ((r[field] as num?) ?? 0));

/* ------------------------------------------------------------- the registry */

/// Every module, in the web's own terms.
final moduleSpecs = <String, ModuleSpec>{
  // ------------------------------------------------------------- procurement
  'material/indents': ModuleSpec(
    key: 'material/indents',
    title: 'Indents',
    searchHint: 'Indent no., item, project, activity…',
    createLabel: 'New indent',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('SUBMITTED', 'Submitted'), ('PM_APPROVED', 'PM approved'),
        ('ADMIN_APPROVED', 'Admin approved'), ('PARTIALLY_ORDERED', 'Partly ordered'),
        ('ORDERED', 'Ordered'), ('CLOSED', 'Closed'), ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
      ]),
      FilterSpec(key: 'from', label: 'Raised from', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'Raised to', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Indents'),
      Figure('${countWhere(rows, "status", ["SUBMITTED", "PM APPROVED"])}', 'Awaiting',
          tone: countWhere(rows, "status", ["SUBMITTED", "PM APPROVED"]) > 0 ? Tone.warn : null),
      Figure('${sumOf(rows, "lines").toInt()}', 'Lines'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['purpose', 'activity'], fallback: 'Material request'),
      subtitle: (r) => '${_s(r, "indentNo")}${(r["lines"] as num? ?? 0) > 1 ? " · ${r["lines"]} items" : ""}',
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['raisedBy', 'project']),
      trailing: (r) => r['waitingDays'] == null ? '' : '${r["waitingDays"]} d',
    ),
    detail: [
      DetailField('Indent no.', (r) => r['indentNo']),
      DetailField('Project', (r) => r['project']),
      DetailField('Raised by', (r) => r['raisedBy']),
      DetailField('Raised on', (r) => r['raisedAt']),
      DetailField('Required by', (r) => r['requiredBy']),
      DetailField('Lines', (r) => r['lines']),
      DetailField('Activity', (r) => r['activity']),
      DetailField('Purpose', (r) => r['purpose'], wide: true),
    ],
  ),

  'material/purchase-orders': ModuleSpec(
    key: 'material/purchase-orders',
    title: 'Purchase Orders',
    searchHint: 'PO no., vendor, item, indent…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('PENDING_PM_APPROVAL', 'Pending PM'),
        ('PENDING_ADMIN_APPROVAL', 'Pending Admin'), ('APPROVED', 'Approved'),
        ('PARTIALLY_RECEIVED', 'Partly received'), ('RECEIVED', 'Received'),
        ('CLOSED', 'Closed'), ('CANCELLED', 'Cancelled'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Orders'),
      Figure('${countWhere(rows, "status", ["PENDING"])}', 'Awaiting',
          tone: countWhere(rows, "status", ["PENDING"]) > 0 ? Tone.warn : null),
      Figure(money(sumOf(rows, 'value'), short: true), 'Ordered'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['vendor'], fallback: 'Purchase order'),
      subtitle: (r) => _s(r, 'poNo'),
      trailing: (r) => money(r['value'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "project")} · ${_s(r, "receivedPct")}% received',
    ),
    detail: [
      DetailField('PO no.', (r) => r['poNo']),
      DetailField('Vendor', (r) => r['vendor']),
      DetailField('Project', (r) => r['project']),
      DetailField('Ordered on', (r) => r['poDate']),
      DetailField('Expected', (r) => r['expectedDate']),
      DetailField('Value', (r) => r['value'], money: true),
      DetailField('Lines', (r) => r['lines']),
      DetailField('Received', (r) => r['receivedPct']),
      DetailField('Raised by', (r) => r['raisedBy']),
    ],
  ),

  'material/grn': ModuleSpec(
    key: 'material/grn',
    title: 'Goods Receipt',
    searchHint: 'GRN no., PO, vendor, receiver…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('INSPECTED', 'Inspected'), ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Receipts'),
      Figure('${countWhere(rows, "status", ["DRAFT", "INSPECTED"])}', 'Not posted',
          tone: countWhere(rows, "status", ["DRAFT", "INSPECTED"]) > 0 ? Tone.warn : null),
      Figure('${countWhere(rows, "status", ["POSTED"])}', 'Posted'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['vendor'], fallback: 'Receipt'),
      subtitle: (r) => _join(r, ['grnNo', 'poNo']),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "store")} · ${_s(r, "accepted")} accepted'
          '${(r["rejected"] as num? ?? 0) > 0 ? ", ${r["rejected"]} rejected" : ""}',
    ),
    detail: [
      DetailField('GRN no.', (r) => r['grnNo']),
      DetailField('Against PO', (r) => r['poNo']),
      DetailField('Vendor', (r) => r['vendor']),
      DetailField('Store', (r) => r['store']),
      DetailField('Received on', (r) => r['grnDate']),
      DetailField('Challan', (r) => r['challanNo']),
      DetailField('Accepted', (r) => r['accepted']),
      DetailField('Rejected', (r) => r['rejected']),
      DetailField('Short', (r) => r['short']),
      DetailField('Three-way match', (r) => r['match']),
    ],
  ),

  'material/stock': ModuleSpec(
    key: 'material/stock',
    title: 'Item Master',
    searchHint: 'Item name, code, specification…',
    filters: const [
      FilterSpec(key: 'state', label: 'Stock state', options: [
        ('low', 'At or below reorder'), ('zero', 'Nothing in store'), ('ok', 'In stock'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Items'),
      Figure(money(sumOf(rows, 'value'), short: true), 'Valuation'),
      Figure('${rows.where((r) => ((r["quantity"] as num?) ?? 0) <= 0).length}', 'Out of stock',
          tone: rows.any((r) => ((r["quantity"] as num?) ?? 0) <= 0) ? Tone.bad : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Item'),
      subtitle: (r) => _join(r, ['code', 'category']),
      trailing: (r) => '${_s(r, "quantity")} ${_s(r, "uom")}'.trim(),
      status: (r) => _s(r, 'state'),
      statusTone: (r) => toneOfStatus(_s(r, 'state')),
      meta: (r, now) => _join(r, ['store', 'category']),
    ),
    detail: [
      DetailField('Item', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Category', (r) => r['category']),
      DetailField('Unit', (r) => r['uom']),
      DetailField('Store', (r) => r['store']),
      DetailField('In store', (r) => r['quantity']),
      DetailField('Reorder at', (r) => r['reorderLevel']),
      DetailField('Average rate', (r) => r['avgRate'], money: true),
      DetailField('Valuation', (r) => r['value'], money: true),
    ],
  ),

  'material/vendors': ModuleSpec(
    key: 'material/vendors',
    title: 'Vendors',
    searchHint: 'Vendor, contact, mobile, GSTIN…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Vendors'),
      Figure('${countWhere(rows, "status", ["ACTIVE"])}', 'Active'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Vendor'),
      subtitle: (r) => _join(r, ['code', 'categories']),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['contactPerson', 'phone']),
    ),
    detail: [
      DetailField('Vendor', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Categories', (r) => r['categories']),
      DetailField('Contact', (r) => r['contactPerson']),
      DetailField('Phone', (r) => r['phone']),
      DetailField('Email', (r) => r['email']),
      DetailField('GSTIN', (r) => r['gstin']),
      DetailField('PAN', (r) => r['pan']),
      DetailField('On-time', (r) => r['onTimePct']),
      DetailField('Deliveries', (r) => r['deliveries']),
    ],
  ),

  'material/issues': ModuleSpec(
    key: 'material/issues',
    title: 'Issues',
    searchHint: 'Issue, item, store, purpose…',
    filters: const [
      FilterSpec(key: 'ack', label: 'Acknowledged', options: [('yes', 'Acknowledged'), ('no', 'Not yet')]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Issues'),
      Figure(money(sumOf(rows, 'value'), short: true), 'Issued'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['issuedTo', 'purpose'], fallback: 'Material issue'),
      subtitle: (r) => _join(r, ['issueNo', 'store']),
      trailing: (r) => money(r['value'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['project', 'workPackage']),
    ),
    detail: [
      DetailField('Issue no.', (r) => r['issueNo']),
      DetailField('Store', (r) => r['store']),
      DetailField('Issued to', (r) => r['issuedTo']),
      DetailField('Issued by', (r) => r['issuedBy']),
      DetailField('Project', (r) => r['project']),
      DetailField('Activity', (r) => r['workPackage']),
      DetailField('Lines', (r) => r['lines']),
      DetailField('Value', (r) => r['value'], money: true),
      DetailField('Acknowledged', (r) => r['acknowledgedAt']),
      DetailField('Purpose', (r) => r['purpose'], wide: true),
    ],
  ),

  'material/returns': ModuleSpec(
    key: 'material/returns',
    title: 'Returns',
    searchHint: 'Return, issue, item, raised by…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Returns'),
      Figure('${countWhere(rows, "status", ["PENDING"])}', 'Pending',
          tone: countWhere(rows, "status", ["PENDING"]) > 0 ? Tone.warn : null),
      Figure(money(sumOf(rows, 'value'), short: true), 'Value'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['reason'], fallback: 'Return'),
      subtitle: (r) => _join(r, ['returnNo', 'issueNo']),
      trailing: (r) => money(r['value'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['raisedBy', 'store']),
    ),
    detail: [
      DetailField('Return no.', (r) => r['returnNo']),
      DetailField('Against issue', (r) => r['issueNo']),
      DetailField('Store', (r) => r['store']),
      DetailField('Project', (r) => r['project']),
      DetailField('Raised by', (r) => r['raisedBy']),
      DetailField('Lines', (r) => r['lines']),
      DetailField('Damaged', (r) => r['damaged']),
      DetailField('Value', (r) => r['value'], money: true),
      DetailField('Decided by', (r) => r['decidedBy']),
      DetailField('Reason', (r) => r['reason'], wide: true),
      DetailField('Decision note', (r) => r['decisionNote'], wide: true),
    ],
  ),

  'material/transfers': ModuleSpec(
    key: 'material/transfers',
    title: 'Transfers',
    searchHint: 'Transfer, store, item, remarks…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('RECEIVED', 'Received'),
        ('CANCELLED', 'Cancelled'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Transfers'),
      Figure('${countWhere(rows, "status", ["PENDING"])}', 'Pending',
          tone: countWhere(rows, "status", ["PENDING"]) > 0 ? Tone.warn : null),
    ],
    row: RowSpec(
      title: (r) => '${_s(r, "fromStore")} → ${_s(r, "toStore")}',
      subtitle: (r) => _s(r, 'transferNo'),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "transferDate")} · ${_s(r, "sent")} sent, ${_s(r, "received")} received',
    ),
    detail: [
      DetailField('Transfer no.', (r) => r['transferNo']),
      DetailField('From', (r) => r['fromStore']),
      DetailField('To', (r) => r['toStore']),
      DetailField('Dated', (r) => r['transferDate']),
      DetailField('Lines', (r) => r['lines']),
      DetailField('Sent', (r) => r['sent']),
      DetailField('Received', (r) => r['received']),
      DetailField('Remarks', (r) => r['remarks'], wide: true),
    ],
  ),

  'material/invoices': ModuleSpec(
    key: 'material/invoices',
    title: 'Vendor Invoices',
    searchHint: 'Invoice, vendor, PO…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('MATCHED', 'Matched'), ('MISMATCH', 'Mismatch'),
        ('APPROVED', 'Approved'), ('PARTIALLY_PAID', 'Partly paid'), ('PAID', 'Paid'),
        ('CANCELLED', 'Cancelled'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Invoices'),
      Figure('${countWhere(rows, "status", ["MISMATCH"])}', 'Mismatched',
          tone: countWhere(rows, "status", ["MISMATCH"]) > 0 ? Tone.bad : null),
      Figure(money(sumOf(rows, 'amount'), short: true), 'Invoiced'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['vendor'], fallback: 'Invoice'),
      subtitle: (r) => _join(r, ['invoiceNo', 'poNo']),
      trailing: (r) => money(r['amount'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "project")} · ${money(r["outstanding"] as num?)} outstanding',
    ),
    detail: [
      DetailField('Invoice', (r) => r['invoiceNo']),
      DetailField('Vendor', (r) => r['vendor']),
      DetailField('Against PO', (r) => r['poNo']),
      DetailField('Project', (r) => r['project']),
      DetailField('Invoiced', (r) => r['amount'], money: true),
      DetailField('Paid', (r) => r['paid'], money: true),
      DetailField('Outstanding', (r) => r['outstanding'], money: true),
      DetailField('Dated', (r) => r['invoiceDate']),
    ],
  ),

  'material/payments': ModuleSpec(
    key: 'material/payments',
    title: 'Payments',
    searchHint: 'Payment, invoice, vendor, reference…',
    filters: const [
      FilterSpec(key: 'mode', label: 'Mode', options: [
        ('CASH', 'Cash'), ('CHEQUE', 'Cheque'), ('NEFT', 'NEFT'), ('RTGS', 'RTGS'),
        ('UPI', 'UPI'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Payments'),
      Figure(money(sumOf(rows, 'amount'), short: true), 'Paid'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['vendor'], fallback: 'Payment'),
      subtitle: (r) => _join(r, ['paymentNo', 'invoiceNo']),
      trailing: (r) => money(r['amount'] as num?),
      status: (r) => _s(r, 'mode'),
      statusTone: (r) => Tone.info,
      meta: (r, now) => _join(r, ['referenceNo', 'paymentDate']),
    ),
    detail: [
      DetailField('Payment no.', (r) => r['paymentNo']),
      DetailField('Vendor', (r) => r['vendor']),
      DetailField('Against invoice', (r) => r['invoiceNo']),
      DetailField('Against PO', (r) => r['poNo']),
      DetailField('Project', (r) => r['project']),
      DetailField('Mode', (r) => r['mode']),
      DetailField('Reference', (r) => r['referenceNo']),
      DetailField('Amount', (r) => r['amount'], money: true),
      DetailField('Paid on', (r) => r['paymentDate']),
    ],
  ),

  'material/reorder': ModuleSpec(
    key: 'material/reorder',
    title: 'Reorder',
    searchHint: 'Item code or name…',
    figures: (rows, now) => [
      Figure('${rows.length}', 'At reorder', tone: rows.isNotEmpty ? Tone.warn : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Item'),
      subtitle: (r) => _join(r, ['code', 'category']),
      trailing: (r) => '${_s(r, "onHand")} / ${_s(r, "reorderLevel")}',
      meta: (r, now) => 'Short ${_s(r, "shortfall")} ${_s(r, "uom")} · ${money(r["cost"] as num?)} to cover',
    ),
    detail: [
      DetailField('Item', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Category', (r) => r['category']),
      DetailField('Unit', (r) => r['uom']),
      DetailField('On hand', (r) => r['onHand']),
      DetailField('Reorder at', (r) => r['reorderLevel']),
      DetailField('Shortfall', (r) => r['shortfall']),
      DetailField('Cost to cover', (r) => r['cost'], money: true),
    ],
  ),

  // ----------------------------------------------------------------- project
  'projects/projects': ModuleSpec(
    key: 'projects/projects',
    title: 'Projects',
    searchHint: 'Name, code, RERA, city, manager…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('PLANNING', 'Planning'), ('ACTIVE', 'Active'), ('ON_HOLD', 'On hold'),
        ('COMPLETED', 'Completed'), ('CANCELLED', 'Cancelled'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Projects'),
      Figure('${countWhere(rows, "status", ["ACTIVE"])}', 'Active'),
      Figure('${countWhere(rows, "status", ["COMPLETED"])}', 'Completed'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Project'),
      subtitle: (r) => _join(r, ['code', 'city']),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      trailing: (r) => _s(r, 'progress').isEmpty ? '' : '${_s(r, "progress")}%',
      meta: (r, now) => '${_s(r, "manager")} · ${_s(r, "units")} units, '
          '${_s(r, "towers")} towers',
    ),
    detail: [
      DetailField('Project', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Type', (r) => r['type']),
      DetailField('Company', (r) => r['company']),
      DetailField('City', (r) => r['city']),
      DetailField('Manager', (r) => r['manager']),
      DetailField('RERA', (r) => r['rera']),
      DetailField('Towers', (r) => r['towers']),
      DetailField('Floors', (r) => r['floors']),
      DetailField('Units', (r) => r['units']),
      DetailField('Team', (r) => r['team']),
      DetailField('Progress', (r) => r['progress']),
      DetailField('Budget', (r) => r['budget'], money: true),
      DetailField('Starts', (r) => r['startDate']),
      DetailField('Target', (r) => r['targetDate']),
    ],
  ),

  'projects/progress': ModuleSpec(
    key: 'projects/progress',
    title: 'Site Progress',
    searchHint: 'Activity, project, logged by…',
    filters: const [
      FilterSpec(key: 'from', label: 'Logged from', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'Logged to', kind: FilterKind.date),
    ],
    figures: (rows, now) => [Figure('${rows.length}', 'Logs')],
    row: RowSpec(
      title: (r) => _first(r, ['title'], fallback: 'Site progress'),
      subtitle: (r) => _join(r, ['project', 'logDate']),
      trailing: (r) => _s(r, 'manpower').isEmpty ? '' : '${_s(r, "manpower")} on site',
      meta: (r, now) => _join(r, ['loggedBy', 'weather']),
    ),
    detail: [
      DetailField('Entry', (r) => r['title']),
      DetailField('Project', (r) => r['project']),
      DetailField('Logged on', (r) => r['logDate']),
      DetailField('Logged by', (r) => r['loggedBy']),
      DetailField('Manpower', (r) => r['manpower']),
      DetailField('Weather', (r) => r['weather']),
      DetailField('Photos', (r) => r['photos']),
      DetailField('Notes', (r) => r['notes'], wide: true),
    ],
  ),

  'schedule/activities': ModuleSpec(
    key: 'schedule/activities',
    title: 'Schedule',
    searchHint: 'Activity, code…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('NOT_STARTED', 'Not started'), ('IN_PROGRESS', 'In progress'),
        ('COMPLETED', 'Completed'), ('DELAYED', 'Delayed'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Activities'),
      Figure('${countWhere(rows, "status", ["PROGRESS"])}', 'Running'),
      Figure('${countWhere(rows, "status", ["DELAY"])}', 'Delayed',
          tone: countWhere(rows, "status", ["DELAY"]) > 0 ? Tone.bad : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Activity'),
      subtitle: (r) => _join(r, ['code']),
      trailing: (r) => _s(r, 'progressPct').isEmpty ? '' : '${_s(r, "progressPct")}%',
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${shortDate(r["plannedStart"])} → ${shortDate(r["plannedEnd"])}'
          '${r["isCriticalPath"] == true ? " · critical path" : ""}',
    ),
    detail: [
      DetailField('Activity', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Planned start', (r) => r['plannedStart']),
      DetailField('Planned finish', (r) => r['plannedEnd']),
      DetailField('Duration', (r) => r['durationDays']),
      DetailField('Baseline start', (r) => r['baselineStart']),
      DetailField('Baseline finish', (r) => r['baselineEnd']),
      DetailField('Actual start', (r) => r['actualStart']),
      DetailField('Actual finish', (r) => r['actualEnd']),
      DetailField('Progress', (r) => r['progressPct']),
      DetailField('Milestone', (r) => r['isMilestone']),
      DetailField('Critical path', (r) => r['isCriticalPath']),
      DetailField('Depends on', (r) => r['predecessors'], wide: true),
    ],
  ),

  // ------------------------------------------------------------------- sales
  'sales/leads': ModuleSpec(
    key: 'sales/leads',
    title: 'Leads · CRM',
    searchHint: 'Name, phone, requirement…',
    filters: const [
      FilterSpec(key: 'stage', label: 'Stage', options: [
        ('NEW', 'New'), ('CONTACTED', 'Contacted'),
        ('SITE_VISIT_SCHEDULED', 'Visit scheduled'), ('VISIT_DONE', 'Visit done'),
        ('NEGOTIATION', 'Negotiation'), ('BOOKED', 'Booked'), ('LOST', 'Lost'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Leads'),
      Figure('${countWhere(rows, "stage", ["BOOKED"])}', 'Booked', tone: Tone.good),
      Figure('${countWhere(rows, "stage", ["LOST"])}', 'Lost'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Lead'),
      subtitle: (r) => _join(r, ['leadNo', 'source']),
      status: (r) => _s(r, 'stage'),
      statusTone: (r) => toneOfStatus(_s(r, 'stage')),
      meta: (r, now) => _join(r, ['owner', 'phone']),
    ),
    detail: [
      DetailField('Lead', (r) => r['name']),
      DetailField('Lead no.', (r) => r['leadNo']),
      // Masked for anyone without sales.lead.viewContact — the server masks
      // it, so whatever arrives is what this person may see.
      DetailField('Phone', (r) => r['phone']),
      DetailField('Alternate', (r) => r['altPhone']),
      DetailField('Email', (r) => r['email']),
      DetailField('Stage', (r) => r['stage']),
      DetailField('Source', (r) => r['source']),
      DetailField('Owner', (r) => r['owner']),
      DetailField('Project', (r) => r['project']),
      DetailField('Interested in', (r) => r['unitType']),
      DetailField('Budget from', (r) => r['budgetMin'], money: true),
      DetailField('Budget to', (r) => r['budgetMax'], money: true),
      DetailField('Next action', (r) => r['nextActionAt']),
      DetailField('Requirement', (r) => r['requirement'], wide: true),
    ],
  ),

  'sales/follow-ups': ModuleSpec(
    key: 'sales/follow-ups',
    title: 'Follow-ups',
    searchHint: 'Lead, phone, requirement…',
    filters: const [
      FilterSpec(key: 'due', label: 'Due', options: [('overdue', 'Overdue only')]),
      FilterSpec(key: 'from', label: 'Next action from', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'Next action to', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Follow-ups'),
      Figure('${rows.where((r) => (r["overdueDays"] as num? ?? 0) > 0).length}', 'Overdue',
          tone: rows.any((r) => (r["overdueDays"] as num? ?? 0) > 0) ? Tone.bad : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Lead'),
      subtitle: (r) => _join(r, ['requirement', 'project']),
      trailing: (r) => (r['overdueDays'] as num? ?? 0) > 0 ? '${r["overdueDays"]} d late' : '',
      status: (r) => _s(r, 'state'),
      statusTone: (r) => toneOfStatus(_s(r, 'state')),
      meta: (r, now) => 'Next ${shortDate(r["nextActionAt"])} · ${_s(r, "lastContact")}',
    ),
    detail: [
      DetailField('Lead', (r) => r['name']),
      DetailField('Phone', (r) => r['phone']),
      DetailField('Next action', (r) => r['nextActionAt']),
      DetailField('Overdue by', (r) => r['overdueDays']),
      DetailField('Owner', (r) => r['owner']),
      DetailField('Last contact', (r) => r['lastContact']),
      DetailField('Requirement', (r) => r['requirement'], wide: true),
    ],
  ),

  'sales/site-visits': ModuleSpec(
    key: 'sales/site-visits',
    title: 'Site Visits',
    searchHint: 'Lead, customer, unit, executive…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('scheduled', 'Scheduled'), ('completed', 'Completed'), ('cancelled', 'Cancelled'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Visits'),
      Figure('${countWhere(rows, "status", ["SCHEDULED"])}', 'Scheduled', tone: Tone.warn),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['lead'], fallback: 'Visit'),
      subtitle: (r) => _join(r, ['leadNo', 'project']),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "conductedBy")} · ${shortDate(r["scheduledAt"])}',
    ),
    detail: [
      DetailField('Lead', (r) => r['lead']),
      DetailField('Lead no.', (r) => r['leadNo']),
      DetailField('Phone', (r) => r['phone']),
      DetailField('Stage', (r) => r['stage']),
      DetailField('Project', (r) => r['project']),
      DetailField('Conducted by', (r) => r['conductedBy']),
      DetailField('Scheduled', (r) => r['scheduledAt']),
      DetailField('Visited', (r) => r['visitedAt']),
      DetailField('Rating', (r) => r['rating']),
      DetailField('Feedback', (r) => r['feedback'], wide: true),
    ],
  ),

  'sales/customers': ModuleSpec(
    key: 'sales/customers',
    title: 'Customers',
    searchHint: 'Customer, phone, booking…',
    figures: (rows, now) => [
      Figure('${rows.length}', 'Customers'),
      Figure(money(sumOf(rows, 'bookedValue'), short: true), 'Booked'),
      Figure(money(sumOf(rows, 'received'), short: true), 'Collected'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Customer'),
      subtitle: (r) => _join(r, ['customerNo', 'units']),
      trailing: (r) => money(r['bookedValue'] as num?),
      status: (r) => _s(r, 'kyc'),
      statusTone: (r) => toneOfStatus(_s(r, 'kyc')),
      meta: (r, now) => '${_s(r, "phone")} · collected ${money(r["received"] as num?)}',
    ),
    detail: [
      DetailField('Customer', (r) => r['name']),
      DetailField('Customer no.', (r) => r['customerNo']),
      DetailField('Phone', (r) => r['phone']),
      DetailField('Email', (r) => r['email']),
      DetailField('Bookings', (r) => r['bookings']),
      DetailField('Units', (r) => r['units']),
      DetailField('Booked', (r) => r['bookedValue'], money: true),
      DetailField('Collected', (r) => r['received'], money: true),
      DetailField('KYC', (r) => r['kyc']),
      DetailField('Address', (r) => r['address'], wide: true),
    ],
  ),

  'sales/bookings': ModuleSpec(
    key: 'sales/bookings',
    title: 'Bookings',
    searchHint: 'Booking no, customer, phone, unit…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('CONFIRMED', 'Confirmed'), ('AGREEMENT', 'Agreement'),
        ('REGISTERED', 'Registered'), ('CANCELLED', 'Cancelled'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Bookings'),
      Figure(money(sumOf(rows, 'value'), short: true), 'Booked'),
      Figure('${countWhere(rows, "status", ["REGISTERED"])}', 'Registered', tone: Tone.good),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['customer'], fallback: 'Booking'),
      subtitle: (r) => _join(r, ['bookingNo', 'unit']),
      trailing: (r) => money(r['value'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "project")} · ${_s(r, "collectedPct")}% collected'
          '${(r["overdue"] as num? ?? 0) > 0 ? " · ${money(r["overdue"] as num?)} overdue" : ""}',
    ),
    detail: [
      DetailField('Booking no.', (r) => r['bookingNo']),
      DetailField('Customer', (r) => r['customer']),
      DetailField('Phone', (r) => r['phone']),
      DetailField('Unit', (r) => r['unit']),
      DetailField('Project', (r) => r['project']),
      DetailField('Value', (r) => r['value'], money: true),
      DetailField('Collected', (r) => r['collected'], money: true),
      DetailField('Balance', (r) => r['balance'], money: true),
      DetailField('Overdue', (r) => r['overdue'], money: true),
      DetailField('Sold by', (r) => r['soldBy']),
      DetailField('Booked on', (r) => r['bookingDate']),
    ],
  ),

  'sales/receipts': ModuleSpec(
    key: 'sales/receipts',
    title: 'Receipts',
    searchHint: 'Receipt no, reference, booking, customer…',
    filters: const [
      FilterSpec(key: 'mode', label: 'Mode', options: [
        ('CASH', 'Cash'), ('CHEQUE', 'Cheque'), ('NEFT', 'NEFT'), ('RTGS', 'RTGS'),
        ('UPI', 'UPI'),
      ]),
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Receipts'),
      Figure(money(sumOf(rows, 'amount'), short: true), 'Received'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['customer'], fallback: 'Receipt'),
      subtitle: (r) => _join(r, ['receiptNo', 'bookingNo']),
      trailing: (r) => money(r['amount'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['mode', 'milestone']),
    ),
    detail: [
      DetailField('Receipt no.', (r) => r['receiptNo']),
      DetailField('Customer', (r) => r['customer']),
      DetailField('Against booking', (r) => r['bookingNo']),
      DetailField('Unit', (r) => r['unit']),
      DetailField('Milestone', (r) => r['milestone']),
      DetailField('Mode', (r) => r['mode']),
      DetailField('Reference', (r) => r['referenceNo']),
      DetailField('Bank', (r) => r['bank']),
      DetailField('Amount', (r) => r['amount'], money: true),
      DetailField('Received on', (r) => r['receiptDate']),
      DetailField('Cleared', (r) => r['clearedAt']),
      DetailField('Bounce reason', (r) => r['bounceReason'], wide: true),
    ],
  ),

  'sales/cost-sheets': ModuleSpec(
    key: 'sales/cost-sheets',
    title: 'Cost Sheets',
    searchHint: 'Cost sheet no, lead, unit, project…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('DRAFT', 'Draft'), ('APPROVED', 'Approved'), ('BOOKED', 'Booked'),
        ('EXPIRED', 'Expired'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Sheets'),
      Figure(money(sumOf(rows, 'total'), short: true), 'Quoted'),
      Figure('${countWhere(rows, "status", ["BOOKED"])}', 'Booked', tone: Tone.good),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['lead'], fallback: 'Cost sheet'),
      subtitle: (r) => _join(r, ['costSheetNo', 'unit']),
      trailing: (r) => money(r['total'] as num?),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "project")} · valid to ${shortDate(r["validUntil"])}',
    ),
    detail: [
      DetailField('Cost sheet', (r) => r['costSheetNo']),
      DetailField('Lead', (r) => r['lead']),
      DetailField('Lead no.', (r) => r['leadNo']),
      DetailField('Unit', (r) => r['unit']),
      DetailField('Project', (r) => r['project']),
      DetailField('Base rate', (r) => r['baseRate'], money: true),
      DetailField('Sub total', (r) => r['subTotal'], money: true),
      DetailField('Discount', (r) => r['discount'], money: true),
      DetailField('Discount status', (r) => r['discountStatus']),
      DetailField('Tax', (r) => r['tax'], money: true),
      DetailField('Total', (r) => r['total'], money: true),
      DetailField('Valid until', (r) => r['validUntil']),
    ],
  ),

  'units': ModuleSpec(
    key: 'units',
    title: 'Available Flats',
    searchHint: 'Unit no., tower, type…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [
        ('AVAILABLE', 'Available'), ('HELD', 'On hold'), ('BOOKED', 'Booked'),
        ('AGREEMENT', 'Agreement'), ('REGISTERED', 'Registered'), ('BLOCKED', 'Blocked'),
      ]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Flats'),
      Figure('${countWhere(rows, "status", ["AVAILABLE"])}', 'Available', tone: Tone.good),
      Figure('${countWhere(rows, "status", ["HELD"])}', 'On hold',
          tone: countWhere(rows, "status", ["HELD"]) > 0 ? Tone.warn : null),
    ],
    row: RowSpec(
      title: (r) => '${_s(r, "block")} ${_s(r, "unitNumber")}'.trim(),
      subtitle: (r) => _join(r, ['unitType', 'project']),
      trailing: (r) => _s(r, 'superBuiltUpArea').isEmpty
          ? ''
          : '${_s(r, "superBuiltUpArea")} sft',
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => 'Floor ${_s(r, "floorNumber")} · ${_s(r, "facing")}',
    ),
    detail: [
      DetailField('Unit', (r) => r['unitNumber']),
      DetailField('Block', (r) => r['block']),
      DetailField('Type', (r) => r['unitType']),
      DetailField('Floor', (r) => r['floorNumber']),
      DetailField('Carpet area', (r) => r['carpetArea']),
      DetailField('Built-up', (r) => r['builtUpArea']),
      DetailField('Super built-up', (r) => r['superBuiltUpArea']),
      DetailField('Facing', (r) => r['facing']),
      DetailField('PLC', (r) => r['plcTag']),
      DetailField('Parking', (r) => r['parkingSlots']),
      DetailField('Status', (r) => r['status']),
    ],
  ),

  'units/price-lists': ModuleSpec(
    key: 'units/price-lists',
    title: 'Price Lists',
    searchHint: 'Version name, project…',
    filters: const [
      FilterSpec(key: 'active', label: 'Active', options: [('yes', 'In use'), ('no', 'Superseded')]),
    ],
    figures: (rows, now) => [Figure('${rows.length}', 'Versions')],
    row: RowSpec(
      title: (r) => _first(r, ['name', 'version'], fallback: 'Price list'),
      subtitle: (r) => _join(r, ['projectName', 'version']),
      status: (r) => _s(r, 'state'),
      statusTone: (r) => toneOfStatus(_s(r, 'state')),
      trailing: (r) => money(r['baseRate'] as num?),
      meta: (r, now) => 'From ${shortDate(r["effectiveFrom"])}'
          '${_s(r, "effectiveTo").isEmpty ? "" : " to ${shortDate(r["effectiveTo"])}"}',
    ),
    detail: [
      DetailField('Version', (r) => r['version']),
      DetailField('Name', (r) => r['name']),
      DetailField('Project', (r) => r['projectName']),
      DetailField('Effective from', (r) => r['effectiveFrom']),
      DetailField('Effective to', (r) => r['effectiveTo']),
      DetailField('Base rate', (r) => r['baseRate'], money: true),
      DetailField('Floor rise', (r) => r['floorRise'], money: true),
      DetailField('PLC', (r) => r['plcAmount'], money: true),
      DetailField('State', (r) => r['state']),
    ],
  ),

  // --------------------------------------------------------------- workforce
  'hr/employees': ModuleSpec(
    key: 'hr/employees',
    title: 'Employees',
    searchHint: 'Name, code, designation, mobile…',
    filters: const [
      FilterSpec(key: 'status', label: 'Status', options: [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'On record'),
      Figure('${countWhere(rows, "status", ["ACTIVE"])}', 'Active'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Employee'),
      subtitle: (r) => _join(r, ['code', 'designation']),
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => _join(r, ['type', 'mobile']),
    ),
    detail: [
      DetailField('Employee', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Designation', (r) => r['designation']),
      DetailField('Type', (r) => r['type']),
      DetailField('Mobile', (r) => r['mobile']),
      DetailField('Alternate', (r) => r['altContact']),
      // Masked without hr.employee.viewIdentity — the server decides.
      DetailField('Aadhaar', (r) => r['aadhaar']),
      DetailField('PAN', (r) => r['pan']),
      DetailField('Joined', (r) => r['joinedOn']),
      DetailField('Documents', (r) => r['documents']),
      DetailField('Address', (r) => r['address'], wide: true),
    ],
  ),

  'hr/attendance': ModuleSpec(
    key: 'hr/attendance',
    title: 'Attendance',
    searchHint: 'Employee, code…',
    filters: const [
      FilterSpec(key: 'from', label: 'From', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'To', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Employees'),
      Figure('${sumOf(rows, "present").toInt()}', 'Days present', tone: Tone.good),
      Figure('${sumOf(rows, "absent").toInt()}', 'Days absent',
          tone: sumOf(rows, "absent") > 0 ? Tone.bad : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Employee'),
      subtitle: (r) => _join(r, ['code', 'designation']),
      trailing: (r) => '${_s(r, "payable")} d',
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => '${_s(r, "present")} present · ${_s(r, "half")} half · '
          '${_s(r, "absent")} absent',
    ),
    detail: [
      DetailField('Employee', (r) => r['name']),
      DetailField('Code', (r) => r['code']),
      DetailField('Designation', (r) => r['designation']),
      DetailField('Type', (r) => r['type']),
      DetailField('Present', (r) => r['present']),
      DetailField('Half days', (r) => r['half']),
      DetailField('Absent', (r) => r['absent']),
      DetailField('Payable days', (r) => r['payable']),
      DetailField('Overtime hours', (r) => r['overtime']),
    ],
  ),

  // ------------------------------------------------------------------ others
  'tasks': ModuleSpec(
    key: 'tasks',
    title: 'Tasks',
    searchHint: 'Task no., title, given to, raised by…',
    filters: const [
      FilterSpec(key: 'mine', label: 'Mine', options: [('to', 'Given to me'), ('by', 'Raised by me')]),
      FilterSpec(key: 'priority', label: 'Priority', options: [
        ('HIGH', 'High'), ('MEDIUM', 'Medium'), ('LOW', 'Low'),
      ]),
      FilterSpec(key: 'has', label: 'Kind', options: [
        ('checklist', 'With a checklist'), ('plain', 'Plain'),
      ]),
      FilterSpec(key: 'from', label: 'Due from', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'Due to', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Tasks'),
      Figure(
        '${rows.where((r) {
          final d = DateTime.tryParse('${r["dueAt"] ?? ""}');
          final done = ['CLOSED', 'COMPLETED', 'APPROVED']
              .any((s) => '${r["status"]}'.toUpperCase().contains(s));
          return d != null && !done && d.millisecondsSinceEpoch < now;
        }).length}',
        'Overdue',
        tone: Tone.bad,
      ),
      Figure('${countWhere(rows, "status", ["REVIEW", "APPROVAL"])}', 'In review', tone: Tone.plum),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['title'], fallback: 'Task'),
      subtitle: (r) => _join(r, ['taskNo', 'project']),
      trailing: (r) => _s(r, 'priority') == 'HIGH' ? 'HIGH' : '',
      status: (r) => _s(r, 'status'),
      statusTone: (r) => toneOfStatus(_s(r, 'status')),
      meta: (r, now) => 'For ${_s(r, "assignee")} · due ${shortDate(r["dueAt"])}',
    ),
    detail: [
      DetailField('Task', (r) => r['taskNo']),
      DetailField('Title', (r) => r['title']),
      DetailField('Given to', (r) => r['assignee']),
      DetailField('Raised by', (r) => r['raisedBy']),
      DetailField('Priority', (r) => r['priority']),
      DetailField('Due', (r) => r['dueAt']),
      DetailField('Status', (r) => r['status']),
      DetailField('Location', (r) => r['location'], wide: true),
    ],
  ),

  'tasks/reports': ModuleSpec(
    key: 'tasks/reports',
    title: 'Task Reports',
    searchHint: 'Person…',
    filters: const [
      FilterSpec(key: 'from', label: 'Due from', kind: FilterKind.date),
      FilterSpec(key: 'to', label: 'Due to', kind: FilterKind.date),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'People'),
      Figure('${sumOf(rows, "total").toInt()}', 'Tasks'),
      Figure('${sumOf(rows, "stillOverdue").toInt()}', 'Overdue',
          tone: sumOf(rows, "stillOverdue") > 0 ? Tone.bad : null),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Person'),
      subtitle: (r) => '${_s(r, "total")} tasks · ${_s(r, "onTime")} on time',
      trailing: (r) => _s(r, 'score').isEmpty ? '—' : '${_s(r, "score")}%',
      meta: (r, now) => '${_s(r, "late")} late · ${_s(r, "stillOverdue")} still overdue',
    ),
    detail: [
      DetailField('Person', (r) => r['name']),
      DetailField('Tasks', (r) => r['total']),
      DetailField('On time', (r) => r['onTime']),
      DetailField('Late', (r) => r['late']),
      DetailField('Still overdue', (r) => r['stillOverdue']),
      DetailField('Score', (r) => r['score']),
      DetailField('Avg days late', (r) => r['averageDelayDays']),
    ],
  ),

  'checklists': ModuleSpec(
    key: 'checklists',
    title: 'Checklists',
    searchHint: 'Checklist, category…',
    filters: const [
      FilterSpec(key: 'active', label: 'State', options: [('yes', 'In use'), ('no', 'Retired')]),
    ],
    figures: (rows, now) => [
      Figure('${rows.length}', 'Checklists'),
      Figure('${rows.where((r) => '${r["state"]}' == 'In use').length}', 'In use'),
      Figure('${sumOf(rows, "checkpoints").toInt()}', 'Points'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['name'], fallback: 'Checklist'),
      subtitle: (r) => _join(r, ['category']),
      trailing: (r) => '${_s(r, "checkpoints")} pts',
      status: (r) => _s(r, 'state'),
      statusTone: (r) => _s(r, 'state') == 'In use' ? Tone.good : Tone.draft,
      meta: (r, now) => 'v${_s(r, "version")} · run ${_s(r, "runs")} times',
    ),
    detail: [
      DetailField('Checklist', (r) => r['name']),
      DetailField('Category', (r) => r['category']),
      DetailField('Version', (r) => r['version']),
      DetailField('Points', (r) => r['checkpoints']),
      DetailField('Times run', (r) => r['runs']),
      DetailField('State', (r) => r['state']),
    ],
  ),

  'kb': ModuleSpec(
    key: 'kb',
    title: 'Knowledge Base',
    searchHint: 'Title, summary, body, category…',
    figures: (rows, now) => [
      Figure('${rows.length}', 'Articles'),
      Figure('${rows.where((r) => '${r["state"]}' == 'Published').length}', 'Published'),
    ],
    row: RowSpec(
      title: (r) => _first(r, ['title'], fallback: 'Article'),
      subtitle: (r) => _join(r, ['category']),
      status: (r) => _s(r, 'state'),
      statusTone: (r) => _s(r, 'state') == 'Published' ? Tone.good : Tone.draft,
      meta: (r, now) => 'By ${_s(r, "author")} · ${shortDate(r["updatedAt"])}',
    ),
    detail: [
      DetailField('Title', (r) => r['title']),
      DetailField('Category', (r) => r['category']),
      DetailField('By', (r) => r['author']),
      DetailField('Updated', (r) => r['updatedAt']),
      DetailField('Files', (r) => r['attachments']),
      DetailField('Summary', (r) => r['summary'], wide: true),
    ],
  ),
};
