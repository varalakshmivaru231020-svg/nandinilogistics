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
        permission: 'calendar.agenda.view'),
  ]),
  Group('Execution', [
    Mod(key: 'projects/projects', label: 'Projects', icon: Icons.home_work_outlined,
        permission: 'project.project.view'),
    Mod(key: 'tasks', label: 'Tasks', icon: Icons.check_box_outlined,
        permission: 'task.task.view', badge: 'tasks'),
    Mod(key: 'checklists', label: 'Checklists', icon: Icons.rule_rounded,
        permission: 'checklist.checklist.view'),
    Mod(key: 'schedule/activities', label: 'Schedule', icon: Icons.view_timeline_outlined,
        permission: 'schedule.activity.view'),
  ]),
  Group('Procurement', [
    Mod(key: 'material/indents', label: 'Indents', icon: Icons.description_outlined,
        permission: 'material.indent.view', built: true, badge: 'indents'),
    Mod(key: 'material/purchase-orders', label: 'Purchase Orders', icon: Icons.receipt_long_outlined,
        permission: 'material.purchaseOrder.view'),
    Mod(key: 'material/grn', label: 'Goods Receipt', icon: Icons.local_shipping_outlined,
        permission: 'material.grn.view'),
    Mod(key: 'material/stock', label: 'Item Master', icon: Icons.inventory_2_outlined,
        permission: 'material.stock.view'),
    Mod(key: 'material/vendors', label: 'Vendors', icon: Icons.storefront_outlined,
        permission: 'material.vendor.view'),
  ]),
  Group('Sales', [
    Mod(key: 'sales/leads', label: 'Leads · CRM', icon: Icons.person_search_outlined,
        permission: 'sales.lead.view'),
    Mod(key: 'sales/follow-ups', label: 'Follow-ups', icon: Icons.phone_forwarded_outlined,
        permission: 'sales.followUp.view'),
    Mod(key: 'units', label: 'Available Flats', icon: Icons.apartment_outlined,
        permission: 'unit.unit.view'),
  ]),
  Group('Workforce', [
    Mod(key: 'hr/employees', label: 'Users & Attendance', icon: Icons.badge_outlined,
        permission: 'hr.employee.view'),
  ]),
  Group('Administration', [
    Mod(key: 'kb', label: 'Knowledge Base', icon: Icons.menu_book_outlined,
        permission: 'kb.article.view'),
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
