"use client";

import * as React from "react";

import { usePermissions } from "./permission-provider";

/**
 * Renders children only when the permission check passes.
 *
 *   <Can I={PERM.masters.item.create}><Button>New item</Button></Can>
 *   <Can any={[PERM.a.b.c, PERM.d.e.f]}>…</Can>
 *   <Can all={[…]} fallback={<Locked />}>…</Can>
 *
 * A hidden control is a courtesy, not a lock — the matching server action
 * calls `authorize()` with the same code.
 */
export function Can({
  I,
  any,
  all,
  not,
  fallback = null,
  children,
}: {
  I?: string;
  any?: string[];
  all?: string[];
  /** Inverts the result — useful for "you cannot do this" hints. */
  not?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const perms = usePermissions();

  let allowed = true;
  if (I) allowed = allowed && perms.has(I);
  if (any?.length) allowed = allowed && perms.hasAny(...any);
  if (all?.length) allowed = allowed && perms.hasAll(...all);
  if (not) allowed = !allowed;

  return <>{allowed ? children : fallback}</>;
}

/**
 * Masks a sensitive value behind a FIELD permission — rates, contact numbers,
 * valuations. Shows a dash rather than the value when not granted.
 */
export function Sensitive({
  I,
  children,
  masked = "••••",
}: {
  I: string;
  children: React.ReactNode;
  masked?: React.ReactNode;
}) {
  const perms = usePermissions();
  return <>{perms.has(I) ? children : <span className="text-muted-400">{masked}</span>}</>;
}
