"use client";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { DrawerStep } from "@/components/ui/drawer";
import { IndentForm } from "./new/indent-form";
import type { IndentLookups } from "./lookups";

export function NewIndentDrawer({
  projects, items, canSubmit,
}: IndentLookups & { canSubmit: boolean }) {
  return (
    <NewRecordDrawer
      label="Raise indent"
      title="Raise an indent"
      description="Item, quantity, required-by date and the activity it is for."
    >
      <DrawerStep n={1} className="mb-3.5">Requirement</DrawerStep>
      <IndentForm projects={projects} items={items} canSubmit={canSubmit} />
    </NewRecordDrawer>
  );
}
