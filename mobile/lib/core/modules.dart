import 'package:flutter/material.dart';

/// The navigation, in the web's own sections and order.
///
/// `built` is the honest part. A module listed but not finished is what made
/// the first attempt feel broken — a drawer full of entries that led nowhere.
/// Only built modules are drawn; the rest sit here so the order is fixed in
/// advance and nothing is forgotten.
class Mod {
  const Mod({
    required this.key,
    required this.label,
    required this.icon,
    required this.permission,
    this.built = false,
    this.badge,
  });

  /// Matches the route and, for a list module, the boundary's list key.
  final String key;
  final String label;
  final IconData icon;
  final String permission;
  final bool built;

  /// Where the drawer's count comes from, when it has one.
  final String? badge;
}

class Group {
  const Group(this.label, this.mods);
  final String label;
  final List<Mod> mods;
}

const navigation = <Group>[
  Group('Overview', [
    Mod(key: 'dashboard', label: 'Dashboard', icon: Icons.grid_view_rounded,
        permission: 'dashboard.owner.view', built: true),
    Mod(key: 'approvals', label: 'Approvals', icon: Icons.fact_check_outlined,
        permission: 'approvals.queue.view', built: true, badge: 'approvals'),
    Mod(key: 'calendar', label: 'Calendar', icon: Icons.calendar_month_rounded,
        built: true, permission: 'calendar.agenda.view'),
  ]),
  Group('Execution', [
    Mod(key: 'projects/projects', label: 'Projects', icon: Icons.home_work_outlined,
        built: true, permission: 'project.project.view'),
    Mod(key: 'projects/progress', label: 'Site Progress', icon: Icons.timeline_outlined,
        built: true, permission: 'project.progressLog.view'),
    Mod(key: 'tasks', label: 'Tasks', icon: Icons.check_box_outlined,
        built: true, permission: 'task.task.view', badge: 'tasks'),
    Mod(key: 'tasks/reports', label: 'Task Reports', icon: Icons.bar_chart_outlined,
        built: true, permission: 'task.report.view'),
    Mod(key: 'checklists', label: 'Checklists', icon: Icons.rule_rounded,
        built: true, permission: 'checklist.checklist.view'),
    Mod(key: 'schedule/activities', label: 'Schedule', icon: Icons.view_timeline_outlined,
        built: true, permission: 'schedule.activity.view'),
  ]),
  Group('Procurement', [
    Mod(key: 'material/indents', label: 'Indents', icon: Icons.description_outlined,
        permission: 'material.indent.view', built: true, badge: 'indents'),
    Mod(key: 'material/purchase-orders', label: 'Purchase Orders', icon: Icons.receipt_long_outlined,
        built: true, permission: 'material.purchaseOrder.view'),
    Mod(key: 'material/grn', label: 'Goods Receipt', icon: Icons.local_shipping_outlined,
        built: true, permission: 'material.grn.view'),
    Mod(key: 'material/stock', label: 'Item Master', icon: Icons.inventory_2_outlined,
        built: true, permission: 'material.stock.view'),
    Mod(key: 'material/vendors', label: 'Vendors', icon: Icons.storefront_outlined,
        built: true, permission: 'material.vendor.view'),
    Mod(key: 'material/issues', label: 'Issues', icon: Icons.outbound_outlined,
        built: true, permission: 'material.issue.view'),
    Mod(key: 'material/returns', label: 'Returns', icon: Icons.keyboard_return_rounded,
        built: true, permission: 'material.return.view'),
    Mod(key: 'material/transfers', label: 'Transfers', icon: Icons.swap_horiz_rounded,
        built: true, permission: 'material.transfer.view'),
    Mod(key: 'material/invoices', label: 'Vendor Invoices', icon: Icons.request_quote_outlined,
        built: true, permission: 'material.vendorInvoice.view'),
    Mod(key: 'material/payments', label: 'Payments', icon: Icons.payments_outlined,
        built: true, permission: 'material.vendorPayment.view'),
    Mod(key: 'material/reorder', label: 'Reorder', icon: Icons.restart_alt_rounded,
        built: true, permission: 'material.reorder.view'),
  ]),
  Group('Sales', [
    Mod(key: 'sales/leads', label: 'Leads · CRM', icon: Icons.person_search_outlined,
        built: true, permission: 'sales.lead.view'),
    Mod(key: 'sales/follow-ups', label: 'Follow-ups', icon: Icons.phone_forwarded_outlined,
        built: true, permission: 'sales.followUp.view'),
    Mod(key: 'sales/site-visits', label: 'Site Visits', icon: Icons.directions_walk_outlined,
        built: true, permission: 'sales.siteVisit.view'),
    Mod(key: 'sales/cost-sheets', label: 'Cost Sheets', icon: Icons.calculate_outlined,
        built: true, permission: 'sales.costSheet.view'),
    Mod(key: 'sales/bookings', label: 'Bookings', icon: Icons.bookmark_added_outlined,
        built: true, permission: 'sales.booking.view'),
    Mod(key: 'sales/receipts', label: 'Receipts', icon: Icons.account_balance_wallet_outlined,
        built: true, permission: 'sales.receipt.view'),
    Mod(key: 'sales/customers', label: 'Customers', icon: Icons.people_alt_outlined,
        built: true, permission: 'sales.customer.view'),
    Mod(key: 'units', label: 'Available Flats', icon: Icons.apartment_outlined,
        built: true, permission: 'unit.unit.view'),
    Mod(key: 'units/price-lists', label: 'Price Lists', icon: Icons.sell_outlined,
        built: true, permission: 'unit.priceList.view'),
  ]),
  Group('Workforce', [
    Mod(key: 'hr/employees', label: 'Employees', icon: Icons.badge_outlined,
        built: true, permission: 'hr.employee.view'),
    Mod(key: 'hr/attendance', label: 'Attendance', icon: Icons.how_to_reg_outlined,
        built: true, permission: 'hr.attendance.view'),
  ]),
  Group('Administration', [
    Mod(key: 'kb', label: 'Knowledge Base', icon: Icons.menu_book_outlined,
        built: true, permission: 'kb.article.view'),
  ]),
];

/// Only what this viewer may open **and** what is finished. Groups with
/// nothing left in them disappear rather than standing empty.
List<Group> visible(bool Function(String) can) {
  final out = <Group>[];
  for (final g in navigation) {
    final mods = g.mods.where((m) => m.built && can(m.permission)).toList();
    if (mods.isNotEmpty) out.add(Group(g.label, mods));
  }
  return out;
}

/// Every module the viewer may open once it is finished — for the honest note
/// at the foot of the drawer.
int pendingFor(bool Function(String) can) =>
    navigation.expand((g) => g.mods).where((m) => !m.built && can(m.permission)).length;
