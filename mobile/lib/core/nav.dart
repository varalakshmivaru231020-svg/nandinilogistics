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
  });

  final String key;
  final String title;
  final String? countNoun;
  final String? searchPlaceholder;
  final List<ScreenFilter> filters;
  final String? dateRangeLabel;

  static ScreenDef from(Map<String, dynamic> d) => ScreenDef(
        key: d['key'] as String,
        title: d['title'] as String,
        countNoun: d['countNoun'] as String?,
        searchPlaceholder: d['searchPlaceholder'] as String?,
        dateRangeLabel: (d['dateRange'] as Map?)?['label'] as String?,
        filters: ((d['filters'] as List?) ?? const [])
            .map((f) => ScreenFilter.from(f as Map<String, dynamic>))
            .toList(),
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
