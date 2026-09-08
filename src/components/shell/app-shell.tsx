"use client";

import * as React from "react";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  badges,
  children,
}: {
  badges?: Partial<Record<string, number>>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        badges={badges}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-page">
        <Topbar
          onOpenMobile={() => setMobileOpen(true)}
          pendingCount={badges?.indentPending ?? 0}
        />
        <main className="flex-1 overflow-y-auto px-[26px] pb-10 pt-6">{children}</main>
      </div>
    </div>
  );
}
