"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { DataTable, type Column } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { revokeSessionAction } from "../actions";

interface SessionRow {
  id: string;
  userName: string;
  userEmail: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export function SessionsScreen({
  sessions, canRevoke,
}: { sessions: SessionRow[]; canRevoke: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function revoke(id: string) {
    setBusy(true);
    const res = await revokeSessionAction(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const columns: Column<SessionRow>[] = [
    {
      key: "user",
      header: "User",
      render: (s) => (
        <div>
          <p className="text-sm text-slate-800">{s.userName}</p>
          <p className="text-xs text-slate-500">{s.userEmail}</p>
        </div>
      ),
    },
    {
      key: "device",
      header: "Device",
      render: (s) => (
        <p className="max-w-md truncate text-xs text-slate-500" title={s.userAgent ?? ""}>
          {s.userAgent ?? "Unknown"}
        </p>
      ),
    },
    { key: "ip", header: "IP", render: (s) => <span className="text-xs text-slate-500">{s.ipAddress ?? "—"}</span> },
    { key: "since", header: "Signed in", render: (s) => <span className="text-xs text-slate-500">{formatDateTime(s.createdAt)}</span> },
    { key: "until", header: "Expires", render: (s) => <span className="text-xs text-slate-500">{formatDateTime(s.expiresAt)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      visible: canRevoke,
      render: (s) => (
        <button type="button" onClick={() => revoke(s.id)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600">
          <LogOut className="h-3 w-3" />
          Revoke
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <DataTable columns={columns} rows={sessions} rowKey={(s) => s.id} dense />
    </div>
  );
}
