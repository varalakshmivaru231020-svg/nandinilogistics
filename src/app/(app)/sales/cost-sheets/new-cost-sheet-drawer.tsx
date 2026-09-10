"use client";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { CostSheetBuilder } from "./new/cost-sheet-builder";
import type { CostSheetLookups } from "./lookups";

export function NewCostSheetDrawer({
  units, leads, chargeHeads, rates, canDiscount,
}: CostSheetLookups & { canDiscount: boolean }) {
  return (
    <NewRecordDrawer
      label="New cost sheet"
      title="Generate a cost sheet"
      description="Every line comes from a charge head in the master and a rate from the active price list."
    >
      {units.length === 0 ? (
        <p className="px-2 py-12 text-center text-[12.5px] font-medium text-muted-500">
          No units are available to quote. Every unit in your projects is already
          booked, or you are not mapped to a project with inventory.
        </p>
      ) : (
        <CostSheetBuilder
          preselectedUnitId={undefined}
          preselectedLeadId={undefined}
          units={units}
          leads={leads}
          chargeHeads={chargeHeads}
          rates={rates}
          canDiscount={canDiscount}
        />
      )}
    </NewRecordDrawer>
  );
}
