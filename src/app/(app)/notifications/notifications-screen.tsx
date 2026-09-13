"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

interface Row {
  id: string; kind: string; title: string; body: string | null;
  href: string | null; read: boolean; createdAt: string;
}

export function NotificationsScreen({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const unread = rows.filter((r) => !r.read).length;

  async function markOne(id: string) {
    setBusy(id);
    const res = await markNotificationReadAction(id);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    router.refresh();
  }

  async function markAll() {
    setBusy("all");
    const res = await markAllNotificationsReadAction();
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast(`Marked ${res.data.marked} as read`);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <Card className="px-4 py-14 text-center">
        <BellOff className="mx-auto h-7 w-7 text-muted-300" />
        <p className="mt-2 font-display text-[14px] font-bold text-navy-950">Nothing needs you</p>
        <p className="mt-1 text-[12px] font-medium text-muted-500">
          Escalations and anything addressed to you will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold text-navy-950">
          {unread} unread · {rows.length} total
        </span>
        {unread > 0 && (
          <Button size="sm" variant="secondary" onClick={markAll} loading={busy === "all"}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {rows.map((n) => (
          <li
            key={n.id}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border px-4 py-3",
              n.read ? "border-line-300 bg-white" : "border-brand-100 bg-brand-100/40",
            )}
          >
            <span
              className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-line-400" : "bg-brand-500")}
              aria-label={n.read ? "Read" : "Unread"}
            />
            <div className="min-w-0 flex-1">
              {n.href ? (
                <Link
                  href={n.href}
                  onClick={() => { if (!n.read) void markOne(n.id); }}
                  className="text-[13px] font-bold text-navy-950 transition-colors hover:text-brand-500"
                >
                  {n.title}
                </Link>
              ) : (
                <p className="text-[13px] font-bold text-navy-950">{n.title}</p>
              )}
              {n.body && <p className="mt-0.5 text-[12px] font-medium text-muted-600">{n.body}</p>}
              <p className="mt-1 text-[11px] font-medium text-muted-400">{formatDate(n.createdAt)}</p>
            </div>
            {!n.read && (
              <Button size="xs" variant="ghost" onClick={() => markOne(n.id)} loading={busy === n.id}>
                Mark read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
