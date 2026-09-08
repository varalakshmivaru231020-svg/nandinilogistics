"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input, Select } from "@/components/ui/primitives";

const STATUSES = [
  "DRAFT", "SUBMITTED", "PM_APPROVED", "ADMIN_APPROVED",
  "PARTIALLY_ORDERED", "ORDERED", "CLOSED", "REJECTED", "CANCELLED",
];

export function IndentFilters({ q, status }: { q: string; status: string }) {
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
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
        <Input
          defaultValue={q}
          placeholder="Search indent number…"
          className="pl-8"
          onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
        />
      </div>
      <Select value={status} onChange={(e) => setParam("status", e.target.value)} className="w-48">
        <option value="all">All statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </Select>
    </div>
  );
}
