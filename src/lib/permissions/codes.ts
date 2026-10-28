/**
 * GENERATED FILE — do not edit by hand.
 * Source: src/lib/permissions/registry.ts
 * Regenerate: pnpm perms:codegen
 *
 * 229 permission codes.
 */

export const PERM = {
  "dashboard": {
    "admin": {
      "view": "dashboard.admin.view",
    },
    "teamLeader": {
      "view": "dashboard.teamLeader.view",
    },
    "teleCaller": {
      "view": "dashboard.teleCaller.view",
    },
    "rider": {
      "view": "dashboard.rider.view",
    },
  },
  "approvals": {
    "queue": {
      "view": "approvals.queue.view",
      "decide": "approvals.queue.decide",
    },
  },
  "sales": {
    "lead": {
      "view": "sales.lead.view",
      "create": "sales.lead.create",
      "update": "sales.lead.update",
      "delete": "sales.lead.delete",
      "export": "sales.lead.export",
      "viewAll": "sales.lead.viewAll",
      "assign": "sales.lead.assign",
      "changeStage": "sales.lead.changeStage",
      "markLost": "sales.lead.markLost",
      "viewContact": "sales.lead.viewContact",
      "tabTimeline": "sales.lead.tabTimeline",
      "tabFollowUps": "sales.lead.tabFollowUps",
      "tabNotes": "sales.lead.tabNotes",
      "tabStageHistory": "sales.lead.tabStageHistory",
      "tabFiles": "sales.lead.tabFiles",
      "note": "sales.lead.note",
      "uploadFile": "sales.lead.uploadFile",
      "receiveAssignment": "sales.lead.receiveAssignment",
    },
    "followUp": {
      "view": "sales.followUp.view",
      "create": "sales.followUp.create",
      "update": "sales.followUp.update",
      "delete": "sales.followUp.delete",
      "export": "sales.followUp.export",
      "receiveEscalation": "sales.followUp.receiveEscalation",
    },
  },
  "hr": {
    "employee": {
      "view": "hr.employee.view",
      "create": "hr.employee.create",
      "update": "hr.employee.update",
      "delete": "hr.employee.delete",
      "export": "hr.employee.export",
      "viewIdentity": "hr.employee.viewIdentity",
      "uploadDocument": "hr.employee.uploadDocument",
      "tabStaff": "hr.employee.tabStaff",
      "viewAll": "hr.employee.viewAll",
      "submitOnboarding": "hr.employee.submitOnboarding",
      "acceptOnboarding": "hr.employee.acceptOnboarding",
      "rejectOnboarding": "hr.employee.rejectOnboarding",
      "offerLetter": "hr.employee.offerLetter",
      "idCard": "hr.employee.idCard",
      "manageCompanies": "hr.employee.manageCompanies",
      "setPin": "hr.employee.setPin",
      "requestEdit": "hr.employee.requestEdit",
      "createStaff": "hr.employee.createStaff",
    },
    "referral": {
      "view": "hr.referral.view",
      "export": "hr.referral.export",
    },
    "employmentType": {
      "view": "hr.employmentType.view",
      "create": "hr.employmentType.create",
      "update": "hr.employmentType.update",
      "delete": "hr.employmentType.delete",
    },
    "attendance": {
      "view": "hr.attendance.view",
      "mark": "hr.attendance.mark",
      "markAll": "hr.attendance.markAll",
      "tabReport": "hr.attendance.tabReport",
      "export": "hr.attendance.export",
      "punch": "hr.attendance.punch",
    },
  },
  "task": {
    "task": {
      "view": "task.task.view",
      "create": "task.task.create",
      "update": "task.task.update",
      "delete": "task.task.delete",
      "export": "task.task.export",
      "start": "task.task.start",
      "complete": "task.task.complete",
      "reopen": "task.task.reopen",
      "comment": "task.task.comment",
      "viewAll": "task.task.viewAll",
    },
    "report": {
      "view": "task.report.view",
    },
  },
  "payout": {
    "import": {
      "view": "payout.import.view",
      "create": "payout.import.create",
      "delete": "payout.import.delete",
      "export": "payout.import.export",
      "post": "payout.import.post",
      "correct": "payout.import.correct",
    },
    "payout": {
      "view": "payout.payout.view",
      "viewAll": "payout.payout.viewAll",
      "hold": "payout.payout.hold",
      "export": "payout.payout.export",
    },
  },
  "advance": {
    "advance": {
      "view": "advance.advance.view",
      "create": "advance.advance.create",
      "delete": "advance.advance.delete",
      "export": "advance.advance.export",
      "viewAll": "advance.advance.viewAll",
      "approve": "advance.advance.approve",
    },
    "bikeRent": {
      "view": "advance.bikeRent.view",
      "create": "advance.bikeRent.create",
      "update": "advance.bikeRent.update",
      "delete": "advance.bikeRent.delete",
      "export": "advance.bikeRent.export",
    },
  },
  "accounts": {
    "invoice": {
      "view": "accounts.invoice.view",
      "create": "accounts.invoice.create",
      "update": "accounts.invoice.update",
      "delete": "accounts.invoice.delete",
      "export": "accounts.invoice.export",
      "recordPayment": "accounts.invoice.recordPayment",
    },
  },
  "staff": {
    "payslip": {
      "view": "staff.payslip.view",
      "create": "staff.payslip.create",
      "delete": "staff.payslip.delete",
      "export": "staff.payslip.export",
    },
  },
  "masters": {
    "company": {
      "view": "masters.company.view",
      "create": "masters.company.create",
      "update": "masters.company.update",
      "delete": "masters.company.delete",
      "toggleStatus": "masters.company.toggleStatus",
      "export": "masters.company.export",
      "import": "masters.company.import",
      "manageHubs": "masters.company.manageHubs",
      "assignTeamLeaders": "masters.company.assignTeamLeaders",
      "uploadRateCard": "masters.company.uploadRateCard",
      "viewRateCard": "masters.company.viewRateCard",
      "mapPayoutColumns": "masters.company.mapPayoutColumns",
    },
    "offerLetterTemplate": {
      "view": "masters.offerLetterTemplate.view",
      "create": "masters.offerLetterTemplate.create",
      "update": "masters.offerLetterTemplate.update",
      "delete": "masters.offerLetterTemplate.delete",
      "toggleStatus": "masters.offerLetterTemplate.toggleStatus",
      "export": "masters.offerLetterTemplate.export",
      "import": "masters.offerLetterTemplate.import",
    },
    "advanceReason": {
      "view": "masters.advanceReason.view",
      "create": "masters.advanceReason.create",
      "update": "masters.advanceReason.update",
      "delete": "masters.advanceReason.delete",
      "toggleStatus": "masters.advanceReason.toggleStatus",
      "export": "masters.advanceReason.export",
      "import": "masters.advanceReason.import",
    },
    "department": {
      "view": "masters.department.view",
      "create": "masters.department.create",
      "update": "masters.department.update",
      "delete": "masters.department.delete",
      "toggleStatus": "masters.department.toggleStatus",
      "export": "masters.department.export",
      "import": "masters.department.import",
    },
    "designation": {
      "view": "masters.designation.view",
      "create": "masters.designation.create",
      "update": "masters.designation.update",
      "delete": "masters.designation.delete",
      "toggleStatus": "masters.designation.toggleStatus",
      "export": "masters.designation.export",
      "import": "masters.designation.import",
    },
    "state": {
      "view": "masters.state.view",
      "create": "masters.state.create",
      "update": "masters.state.update",
      "delete": "masters.state.delete",
      "toggleStatus": "masters.state.toggleStatus",
      "export": "masters.state.export",
      "import": "masters.state.import",
    },
    "city": {
      "view": "masters.city.view",
      "create": "masters.city.create",
      "update": "masters.city.update",
      "delete": "masters.city.delete",
      "toggleStatus": "masters.city.toggleStatus",
      "export": "masters.city.export",
      "import": "masters.city.import",
    },
    "leadStage": {
      "view": "masters.leadStage.view",
      "create": "masters.leadStage.create",
      "update": "masters.leadStage.update",
      "delete": "masters.leadStage.delete",
      "toggleStatus": "masters.leadStage.toggleStatus",
      "export": "masters.leadStage.export",
      "import": "masters.leadStage.import",
    },
    "lostReason": {
      "view": "masters.lostReason.view",
      "create": "masters.lostReason.create",
      "update": "masters.lostReason.update",
      "delete": "masters.lostReason.delete",
      "toggleStatus": "masters.lostReason.toggleStatus",
      "export": "masters.lostReason.export",
      "import": "masters.lostReason.import",
    },
    "leadField": {
      "view": "masters.leadField.view",
      "create": "masters.leadField.create",
      "update": "masters.leadField.update",
      "delete": "masters.leadField.delete",
      "toggleStatus": "masters.leadField.toggleStatus",
      "export": "masters.leadField.export",
      "import": "masters.leadField.import",
    },
    "numberingSeries": {
      "view": "masters.numberingSeries.view",
      "create": "masters.numberingSeries.create",
      "update": "masters.numberingSeries.update",
      "delete": "masters.numberingSeries.delete",
      "toggleStatus": "masters.numberingSeries.toggleStatus",
      "export": "masters.numberingSeries.export",
      "import": "masters.numberingSeries.import",
    },
  },
  "admin": {
    "user": {
      "view": "admin.user.view",
      "create": "admin.user.create",
      "update": "admin.user.update",
      "delete": "admin.user.delete",
      "toggleStatus": "admin.user.toggleStatus",
      "export": "admin.user.export",
      "resetPassword": "admin.user.resetPassword",
      "assignRoles": "admin.user.assignRoles",
      "assignPermissions": "admin.user.assignPermissions",
      "revokeSessions": "admin.user.revokeSessions",
      "tabRoles": "admin.user.tabRoles",
      "tabPermissions": "admin.user.tabPermissions",
      "tabActivity": "admin.user.tabActivity",
    },
    "role": {
      "view": "admin.role.view",
      "create": "admin.role.create",
      "update": "admin.role.update",
      "delete": "admin.role.delete",
      "toggleStatus": "admin.role.toggleStatus",
      "export": "admin.role.export",
      "clone": "admin.role.clone",
      "managePermissions": "admin.role.managePermissions",
      "tabPermissions": "admin.role.tabPermissions",
      "tabUsers": "admin.role.tabUsers",
    },
    "permission": {
      "view": "admin.permission.view",
      "sync": "admin.permission.sync",
      "export": "admin.permission.export",
    },
    "audit": {
      "view": "admin.audit.view",
      "export": "admin.audit.export",
    },
    "session": {
      "view": "admin.session.view",
      "revoke": "admin.session.revoke",
    },
    "mobile": {
      "use": "admin.mobile.use",
    },
    "settings": {
      "view": "admin.settings.view",
      "update": "admin.settings.update",
    },
  },
  "reports": {
    "teamLeader": {
      "view": "reports.teamLeader.view",
      "export": "reports.teamLeader.export",
    },
    "ridersByCompany": {
      "view": "reports.ridersByCompany.view",
      "export": "reports.ridersByCompany.export",
    },
    "leadConversion": {
      "view": "reports.leadConversion.view",
      "export": "reports.leadConversion.export",
    },
    "payoutSummary": {
      "view": "reports.payoutSummary.view",
      "export": "reports.payoutSummary.export",
    },
    "advanceOutstanding": {
      "view": "reports.advanceOutstanding.view",
      "export": "reports.advanceOutstanding.export",
    },
    "teleCallerDaily": {
      "view": "reports.teleCallerDaily.view",
      "export": "reports.teleCallerDaily.export",
    },
  },
} as const;

type Leaves<T> = T extends string
  ? T
  : { [K in keyof T]: Leaves<T[K]> }[keyof T];

/** Union of every permission code string in the platform. */
export type PermCode = Leaves<typeof PERM>;
