"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/can";
import { useToast } from "@/components/ui/toast";
import { PERM } from "@/lib/permissions/codes";
import { EmployeeForm, type Referrer } from "./hr-screen";

/**
 * "+ New rider" outside the Riders list — the same drawer, on type Rider, so
 * the record starts as a draft onboarding form.
 */
export function NewRiderButton({
  employmentTypes, riderTypeId, referrers, designations, companies, canManageCompanies,
}: {
  employmentTypes: Array<{ id: string; name: string }>;
  riderTypeId: string | null;
  referrers: Referrer[];
  designations: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  canManageCompanies: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <Can I={PERM.hr.employee.create}>
      <Button size="md" onClick={() => setOpen(true)}>+ New rider</Button>
      {open && (
        <EmployeeForm
          employee={null}
          employmentTypes={employmentTypes}
          defaultTypeId={riderTypeId}
          referrers={referrers}
          designations={designations}
          companies={companies}
          canManageCompanies={canManageCompanies}
          onClose={() => setOpen(false)}
          onSaved={(m) => { setOpen(false); toast(m); router.refresh(); }}
        />
      )}
    </Can>
  );
}
