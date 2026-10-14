import 'package:flutter/material.dart';

import 'api.dart';

/// The sidebar, as the server sends it.
///
/// Not a copy. The app had its own list and it drifted: a dozen screens the web
/// reaches from inside other screens had been promoted to top level, so the
/// drawer and the panel no longer matched. `/screens` returns the web's own
/// `NAVIGATION` — its sections, its order, its labels, already filtered to what
/// this person may open — and the drawer draws exactly that.
class NavItem {
  const NavItem({required this.href, required this.label, this.permission});

  /// The web route. It is the identity of a menu entry here, because it is what
  /// the server sends.
  final String href;
  final String label;
  final String? permission;

  /// The boundary's list key for this screen, where it has one.
  String? get moduleKey => hrefToModule[href];

  IconData get icon => _icons[href] ?? Icons.chevron_right_rounded;
}

class NavSection {
  const NavSection(this.label, this.items);
  final String label;
  final List<NavItem> items;
}

/// Which list each web route reads. The routes without one have a screen of
/// their own — a dashboard, a calendar, a queue — or are web-only.
const hrefToModule = <String, String>{
  '/projects': 'projects/projects',
  '/tasks': 'tasks',
  '/tasks/reports': 'tasks/reports',
  '/checklists': 'checklists',
  '/schedule': 'schedule/activities',
  '/material/indents': 'material/indents',
  '/material/purchase-orders': 'material/purchase-orders',
  '/material/grn': 'material/grn',
  '/material/stock': 'material/stock',
  '/material/vendors': 'material/vendors',
  '/sales/leads': 'sales/leads',
  '/sales/follow-ups': 'sales/follow-ups',
  '/sales/customers': 'sales/customers',
  '/units/board': 'units',
  '/hr': 'hr/employees',
  '/kb': 'kb',
};

const _icons = <String, IconData>{
  '/dashboard': Icons.grid_view_rounded,
  '/calendar': Icons.calendar_month_rounded,
  '/approvals': Icons.fact_check_outlined,
  '/projects': Icons.home_work_outlined,
  '/tasks': Icons.check_box_outlined,
  '/tasks/reports': Icons.bar_chart_outlined,
  '/dashboard/performance': Icons.insights_outlined,
  '/checklists': Icons.rule_rounded,
  '/schedule': Icons.view_timeline_outlined,
  '/material/indents': Icons.description_outlined,
  '/material/purchase-orders': Icons.receipt_long_outlined,
  '/material/grn': Icons.local_shipping_outlined,
  '/material/stock': Icons.inventory_2_outlined,
  '/material/vendors': Icons.storefront_outlined,
  '/sales/leads': Icons.person_search_outlined,
  '/sales/follow-ups': Icons.phone_forwarded_outlined,
  '/sales/customers': Icons.people_alt_outlined,
  '/units/board': Icons.apartment_outlined,
  '/hr': Icons.badge_outlined,
  '/kb': Icons.menu_book_outlined,
  '/masters': Icons.settings_outlined,
};

/// The screens the web reaches from inside another screen rather than from the
/// sidebar — a purchase order leads to its receipts, an item to its reorder
/// list. They are offered the same way here: from the parent's own app bar,
/// not promoted to the menu.
const relatedScreens = <String, List<(String, String)>>{
  'material/indents': [('material/issues', 'Issues')],
  'material/purchase-orders': [
    ('material/grn', 'Goods Receipt'),
    ('material/invoices', 'Vendor Invoices'),
    ('material/payments', 'Payments'),
  ],
  'material/grn': [('material/invoices', 'Vendor Invoices')],
  'material/stock': [
    ('material/reorder', 'Reorder'),
    ('material/transfers', 'Transfers'),
    ('material/returns', 'Material Returns'),
  ],
  'sales/leads': [
    ('sales/site-visits', 'Site Visits'),
    ('sales/cost-sheets', 'Cost Sheets'),
  ],
  'sales/customers': [
    ('sales/bookings', 'Bookings'),
    ('sales/receipts', 'Receipts'),
  ],
  'units': [('units/price-lists', 'Price Lists')],
  'projects/projects': [('projects/progress', 'Site Progress')],
  'hr/employees': [('hr/attendance', 'Attendance')],
};

/// A record behind a web link.
class RecordTarget {
  const RecordTarget(this.module, this.id);
  final String module;
  final String id;
}

/// Turns a web route into the record it points at.
///
/// The calendar and the approvals queue both carry an `href` — the route the
/// web would open — and this is what lets a tap there land on the record rather
/// than on a message saying it cannot. `/material/indents/abc` is the indent
/// list plus an id; `/calendar?event=abc` is a calendar task.
RecordTarget? recordFor(String href) {
  if (href.isEmpty) return null;
  final path = href.split('?').first;
  final query = href.contains('?') ? Uri.splitQueryString(href.split('?')[1]) : const {};

  // A calendar task links back to the calendar with its own id, and a schedule
  // activity to the plan with its own — the web's schedule is one page per
  // project, but the app has a screen for one activity.
  final event = query['event'];
  if (event != null && event.isNotEmpty) return RecordTarget('calendar', event);
  final activity = query['activity'];
  if (activity != null && activity.isNotEmpty) {
    return RecordTarget('schedule/activities', activity);
  }

  final parts = path.split('/').where((p) => p.isNotEmpty).toList();
  if (parts.length < 2) return null;
  final id = parts.last;
  // Ids are cuids — a trailing word like "reports" or "new" is not one.
  if (id.length < 20) return null;

  final module = parts.sublist(0, parts.length - 1).join('/');
  // Where the web's route and the record's module are not the same words.
  const alias = {
    'units': 'units',
    'projects': 'projects/projects',
    'hr': 'hr/employees',
    'material/stock': 'material/stock',
  };
  return RecordTarget(alias[module] ?? module, id);
}

/// Reads `/screens` once, at sign-in.
Future<List<NavSection>> loadNavigation(Api api) async {
  final res = await api.get('/screens');
  if (!res.ok) return const [];
  final sections = (res.data!['navigation'] as List?) ?? const [];
  return sections.map((s) {
    final m = s as Map<String, dynamic>;
    return NavSection(
      m['label'] as String,
      ((m['items'] as List?) ?? const [])
          .map((i) => NavItem(
                href: (i as Map)['href'] as String,
                label: i['label'] as String,
                permission: i['permission'] as String?,
              ))
          .toList(),
    );
  }).toList();
}

/// A module's screen, as the server describes it: the search placeholder it
/// shows, the filters it offers, and what each one is called.
class ScreenDef {
  const ScreenDef({
    required this.key,
    required this.title,
    required this.countNoun,
    required this.searchPlaceholder,
    required this.filters,
    required this.dateRangeLabel,
    this.forms = const [],
    this.record = false,
  });

  final String key;
  final String title;
  final String? countNoun;
  final String? searchPlaceholder;
  final List<ScreenFilter> filters;
  final String? dateRangeLabel;

  /// What this person may create from here. Empty where they hold no create
  /// permission, or where the form is not described yet — either way, no
  /// button is drawn.
  final List<FormRef> forms;

  /// Whether a row on this list opens a record. False where that module's
  /// record screen is not built yet, and then the row is not tappable rather
  /// than opening something that has to apologise.
  final bool record;

  static ScreenDef from(Map<String, dynamic> d) => ScreenDef(
        key: d['key'] as String,
        title: d['title'] as String,
        countNoun: d['countNoun'] as String?,
        searchPlaceholder: d['searchPlaceholder'] as String?,
        dateRangeLabel: (d['dateRange'] as Map?)?['label'] as String?,
        filters: ((d['filters'] as List?) ?? const [])
            .map((f) => ScreenFilter.from(f as Map<String, dynamic>))
            .toList(),
        forms: ((d['forms'] as List?) ?? const [])
            .map((f) => FormRef.from(f as Map<String, dynamic>))
            .toList(),
        record: d['record'] == true,
      );
}

/// A form a screen offers, as its "New …" button needs it.
class FormRef {
  const FormRef({required this.key, required this.title, required this.submitLabel});

  final String key;
  final String title;
  final String submitLabel;

  static FormRef from(Map<String, dynamic> d) => FormRef(
        key: '${d["key"]}',
        title: '${d["title"]}',
        submitLabel: '${d["submitLabel"]}',
      );
}

class ScreenFilter {
  const ScreenFilter({
    required this.name,
    required this.label,
    required this.allLabel,
    required this.options,
  });

  final String name;
  final String label;

  /// What the web calls the everything-option — "All statuses", "Any KYC".
  final String allLabel;
  final List<({String value, String label})> options;

  static ScreenFilter from(Map<String, dynamic> f) => ScreenFilter(
        name: f['name'] as String,
        label: f['label'] as String,
        allLabel: (f['allLabel'] as String?) ?? 'All',
        options: ((f['options'] as List?) ?? const [])
            .map((o) => (value: (o as Map)['value'] as String, label: o['label'] as String))
            .toList(),
      );
}
