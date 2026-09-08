"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input, Select } from "@/components/ui/primitives";

const ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "SUBMIT",
  "CANCEL", "LOGIN", "LOGOUT", "LOGIN_FAILED", "EXPORT", "VIEW", "ASSIGN",
];

export function AuditFilters({
  q, action, entity, entities,
}: {
  q: string;
  action: string;
  entity: string;
  entities: Array<{ entity: string; count: number }>;
  canExport: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (!value || value === "all") sp.delete(key);
    else sp.set(key, value);
    sp.delete("page");
    router.push(`?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          defaultValue={q}
          placeholder="Search what happened…"
          className="pl-8"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
      </div>
      <Select value={action} onChange={(e) => setParam("action", e.target.value)} className="w-40">
        <option value="all">All actions</option>
        {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>
      <Select value={entity} onChange={(e) => setParam("entity", e.target.value)} className="w-48">
        <option value="all">All entities</option>
        {entities.map((e) => (
          <option key={e.entity} value={e.entity}>{e.entity} ({e.count})</option>
        ))}
      </Select>
    </div>
  );
}
