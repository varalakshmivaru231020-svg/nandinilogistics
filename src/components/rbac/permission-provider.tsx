"use client";

import * as React from "react";

/**
 * Carries the signed-in user's resolved permissions to the client tree.
 *
 * This is a convenience for hiding controls — it is NEVER the security
 * boundary. Every server action and route re-checks with `authorize()`, so a
 * user who forges the client state still cannot perform the action.
 */

export interface ClientPrincipal {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  isSuperAdmin: boolean;
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
  canAccessAllProjects: boolean;
}

interface PermissionContextValue extends ClientPrincipal {
  has: (code: string) => boolean;
  hasAny: (...codes: string[]) => boolean;
  hasAll: (...codes: string[]) => boolean;
}

const PermissionContext = React.createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  principal,
  children,
}: {
  principal: ClientPrincipal;
  children: React.ReactNode;
}) {
  const value = React.useMemo<PermissionContextValue>(() => {
    const set = new Set(principal.permissions);
    const has = (code: string) => principal.isSuperAdmin || set.has(code);
    return {
      ...principal,
      has,
      hasAny: (...codes: string[]) => codes.some(has),
      hasAll: (...codes: string[]) => codes.every(has),
    };
  }, [principal]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  const ctx = React.useContext(PermissionContext);
  if (!ctx) throw new Error("usePermissions must be used inside <PermissionProvider>");
  return ctx;
}

/** Convenience hook for a single code. */
export function useCan(code: string): boolean {
  return usePermissions().has(code);
}
