"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, Input, Select } from "@/components/ui/primitives";

interface Row {
  code: string;
  module: string;
  resource: string;
  action: string;
  label: string;
  description: string | null;
  group: string;
  kind: string;
  roles: string[];
}

const KINDS = ["PAGE", "TAB", "BUTTON", "ACTION", "FIELD", "REPORT"];

export function PermissionCatalogue({
  permissions,
  modules,
  canExport,
}: {
  permissions: Row[];
  modules: Array<{ key: string; label: string; pending?: boolean }>;
  canExport: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [module, setModule] = React.useState("all");
  const [kind, setKind] = React.useState("all");

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return permissions.filter((p) => {
      if (module !== "all" && p.module !== module) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (!term) return true;
      return (
        p.code.toLowerCase().includes(term) ||
        p.label.toLowerCase().includes(term) ||
        p.group.toLowerCase().includes(term)
      );
    });
  }, [permissions, search, module, kind]);

  function exportCsv() {
    const header = ["Code", "Module", "Resource", "Action", "Kind", "Group", "Label", "Description", "Roles"];
    const lines = filtered.map((p) => [
      p.code, p.module, p.resource, p.action, p.kind, p.group, p.label,
      p.description ?? "", p.roles.join("; "),
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `permission-catalogue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Row>[] = [
    {
      key: "label",
      header: "Permission",
      render: (p) => (
        <div>
          <p className="text-sm text-navy-900">{p.label}</p>
          <code className="text-[11px] text-muted-400">{p.code}</code>
          {p.description && <p className="mt-0.5 max-w-md text-xs text-muted-500">{p.description}</p>}
        </div>
      ),
    },
    { key: "group", header: "Group", render: (p) => <span className="text-xs text-muted-600">{p.group}</span> },
    { key: "kind", header: "Guards", align: "center", render: (p) => <Badge tone="slate">{p.kind}</Badge> },
    {
      key: "roles",
      header: "Held by roles",
      render: (p) =>
        p.roles.length === 0 ? (
          <span className="text-xs text-warn-700">No role</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.roles.map((r) => <Badge key={r} tone="brand">{r}</Badge>)}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, label or group…" className="pl-8" />
        </div>
        <Select value={module} onChange={(e) => setModule(e.target.value)} className="w-52">
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}{m.pending ? " (pending)" : ""}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
          <option value="all">All kinds</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </Select>
        <div className="flex-1" />
        <Badge tone="slate">{filtered.length} shown</Badge>
        {canExport && (
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={filtered} rowKey={(p) => p.code} dense />
    </div>
  );
}
