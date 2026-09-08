"use client";

import * as React from "react";
import { ChevronDown, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";

import { usePermissions } from "@/components/rbac/permission-provider";
import { logoutAction } from "@/app/(auth)/login/actions";

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const perms = usePermissions();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = perms.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onOpenMobile}
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-800">{perms.name}</span>
            <span className="block text-[11px] leading-tight text-slate-500">
              {perms.roles[0]?.name ?? "No role"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {open && (
          <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <div className="border-b border-slate-100 px-3 py-2.5">
              <p className="text-sm font-medium text-slate-900">{perms.name}</p>
              <p className="text-xs text-slate-500">{perms.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {perms.employeeCode} ·{" "}
                {perms.isSuperAdmin ? "Super Administrator" : `${perms.permissions.length} permissions`}
              </p>
            </div>

            <div className="border-b border-slate-100 px-3 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Roles
              </p>
              <div className="flex flex-wrap gap-1">
                {perms.roles.length === 0 && <span className="text-xs text-slate-400">None</span>}
                {perms.roles.map((r) => (
                  <span
                    key={r.code}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                  >
                    <ShieldCheck className="h-3 w-3 text-slate-400" />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>

            <a
              href="/account"
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <UserRound className="h-4 w-4 text-slate-400" />
              My profile &amp; permissions
            </a>

            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
