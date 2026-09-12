"use client";

import * as React from "react";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({
  badges,
  children,
}: {
  badges?: Partial<Record<string, number>>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <ToastProvider>
      {/* h-screen, not min-h-screen: the shell is pinned to the viewport so the
          sidebar and topbar stay put and only the content pane scrolls. With
          min-h-screen the whole page scrolled and took the sidebar with it. */}
      <div className="flex h-screen overflow-hidden">
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
          <main data-app-scroll className="flex-1 overflow-y-auto px-[26px] pb-10 pt-6">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
