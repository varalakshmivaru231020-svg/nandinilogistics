import 'package:flutter/material.dart';

/// The navigation, in the web's own six sections and order.
///
/// A module whose permission the viewer does not hold is **not drawn** — the
/// drawer is built from what they may open, so nothing in it refuses when
/// tapped. The server re-checks every call regardless; this is courtesy.
class Module {
  const Module({
    required this.label,
    required this.icon,
    this.permission,
    this.prefix,
    this.list,
    this.route,
  }) : assert(permission != null || prefix != null, 'a module needs a gate');

  final String label;
  final IconData icon;

  /// The one code that opens it.
  final String? permission;

  /// Or: any code starting with this. Reports are gated per report, so the way
  /// in is held by whoever holds at least one of them.
  final String? prefix;

  /// The list key at `/api/mobile/v1/list/...`, for a module that is a list.
  final String? list;

  /// A screen of its own, for a module that is not.
  final String? route;

  bool get isList => list != null;
}

class Section {
  const Section(this.label, this.modules);
  final String label;
  final List<Module> modules;
}

/// Mirrors src/lib/navigation.ts. Where a module has no list endpoint yet it
/// carries a `route` instead, or is absent and said so in the brief.
const navigation = <Section>[
  Section('Overview', [
    Module(label: 'Calendar', permission: 'calendar.agenda.view', icon: Icons.calendar_month_rounded, route: '/calendar'),
    /*
     * Gated by prefix, not by one code: every report has its own
     * `reports.<key>.view`, and the screen lists only the ones the caller may
     * run. Somebody holding one report should find the way in.
     */
    Module(label: 'Reports', prefix: 'reports.', icon: Icons.insights_rounded, route: '/reports'),
  ]),
  Section('Execution', [
    Module(label: 'Projects', permission: 'project.project.view', icon: Icons.home_work_rounded, list: 'projects/projects'),
    Module(label: 'Site Progress', permission: 'project.progressLog.view', icon: Icons.timeline_rounded, list: 'projects/progress'),
    Module(label: 'Schedule', permission: 'schedule.activity.view', icon: Icons.view_timeline_rounded, list: 'schedule/activities'),
  ]),
  Section('Procurement', [
    Module(label: 'Indents', permission: 'material.indent.view', icon: Icons.assignment_rounded, list: 'material/indents'),
    Module(label: 'Purchase Orders', permission: 'material.purchaseOrder.view', icon: Icons.receipt_long_rounded, list: 'material/purchase-orders'),
    Module(label: 'Goods Receipt', permission: 'material.grn.view', icon: Icons.local_shipping_rounded, list: 'material/grn'),
    Module(label: 'Issues', permission: 'material.issue.view', icon: Icons.outbound_rounded, list: 'material/issues'),
    Module(label: 'Returns', permission: 'material.return.view', icon: Icons.keyboard_return_rounded, list: 'material/returns'),
    Module(label: 'Transfers', permission: 'material.transfer.view', icon: Icons.swap_horiz_rounded, list: 'material/transfers'),
    Module(label: 'Invoices', permission: 'material.vendorInvoice.view', icon: Icons.request_quote_rounded, list: 'material/invoices'),
    Module(label: 'Payments', permission: 'material.vendorPayment.view', icon: Icons.payments_rounded, list: 'material/payments'),
    Module(label: 'Item Master', permission: 'material.stock.view', icon: Icons.inventory_2_rounded, list: 'material/stock'),
    Module(label: 'Reorder', permission: 'material.reorder.view', icon: Icons.restart_alt_rounded, list: 'material/reorder'),
    Module(label: 'Vendors', permission: 'material.vendor.view', icon: Icons.storefront_rounded, list: 'material/vendors'),
  ]),
  Section('Sales', [
    Module(label: 'Leads · CRM', permission: 'sales.lead.view', icon: Icons.person_search_rounded, list: 'sales/leads'),
    Module(label: 'Site Visits', permission: 'sales.siteVisit.view', icon: Icons.directions_walk_rounded, list: 'sales/site-visits'),
    Module(label: 'Cost Sheets', permission: 'sales.costSheet.view', icon: Icons.calculate_rounded, list: 'sales/cost-sheets'),
    Module(label: 'Bookings', permission: 'sales.booking.view', icon: Icons.bookmark_added_rounded, list: 'sales/bookings'),
    Module(label: 'Receipts', permission: 'sales.receipt.view', icon: Icons.account_balance_wallet_rounded, list: 'sales/receipts'),
    Module(label: 'Customers', permission: 'sales.customer.view', icon: Icons.people_alt_rounded, list: 'sales/customers'),
    Module(label: 'Available Flats', permission: 'unit.unit.view', icon: Icons.apartment_rounded, list: 'units'),
    Module(label: 'Price Lists', permission: 'unit.priceList.view', icon: Icons.sell_rounded, list: 'units/price-lists'),
  ]),
  Section('Workforce', [
    Module(label: 'Employees', permission: 'hr.employee.view', icon: Icons.badge_rounded, list: 'hr/employees'),
    Module(label: 'Attendance', permission: 'hr.attendance.view', icon: Icons.how_to_reg_rounded, list: 'hr/attendance'),
  ]),
];

/// The routes the shell knows how to open. A module pointing anywhere else is
/// a tile that does nothing, which is worse than a tile that is not there.
const dispatchedRoutes = {'/calendar', '/reports'};

/// Only the modules this viewer may open, sections with nothing in them gone.
List<Section> visibleNavigation(bool Function(String) can, {Set<String>? held}) {
  bool opens(Module m) {
    if (m.permission != null) return can(m.permission!);
    // A prefix gate. `can` already answers true for a super admin, so asking it
    // about the prefix itself settles that case before the set is consulted —
    // a super admin holding no role at all has an empty set.
    if (can(m.prefix!)) return true;
    return (held ?? const <String>{}).any((c) => c.startsWith(m.prefix!));
  }

  final out = <Section>[];
  for (final section in navigation) {
    final allowed = section.modules.where(opens).toList();
    if (allowed.isNotEmpty) out.add(Section(section.label, allowed));
  }
  return out;
}
