"use client";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { IssueForm } from "./new/issue-form";
import type { IssueLookups } from "./lookups";

export function NewIssueDrawer({
  projects, stores, recipients, stock, canViewValue,
}: IssueLookups & { canViewValue: boolean }) {
  return (
    <NewRecordDrawer
      label="Issue material"
      title="Issue material"
      description="Moves stock out of the store and onto a work package, at the store's weighted-average rate."
    >
      <IssueForm
        projects={projects}
        stores={stores}
        recipients={recipients}
        stock={stock}
        canViewValue={canViewValue}
      />
    </NewRecordDrawer>
  );
}
