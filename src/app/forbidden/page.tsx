import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPermission } from "@/lib/permissions/registry";

export const metadata = { title: "Access denied" };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const permission = code ? getPermission(code) : undefined;

  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken px-6">
      <div className="w-full max-w-md rounded-lg border border-line-400 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-bad-050 text-bad-600">
          <ShieldX className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-navy-950">Access denied</h1>
        <p className="mt-2 text-sm text-muted-600">
          Your role does not include the permission needed to open this screen.
        </p>

        {permission && (
          <div className="mt-4 rounded-md border border-line-400 bg-surface-sunken px-3 py-2 text-left">
            <p className="text-xs font-medium text-navy-600">{permission.label}</p>
            <code className="mt-0.5 block text-xs text-muted-500">{permission.code}</code>
            {permission.description && (
              <p className="mt-1 text-xs text-muted-500">{permission.description}</p>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-500">
          Ask an administrator to grant this permission to your role, or to you directly, from
          Administration → Roles.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
