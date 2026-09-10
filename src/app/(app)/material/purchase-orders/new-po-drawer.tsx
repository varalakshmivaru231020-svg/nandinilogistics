"use client";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { PoForm } from "./new/po-form";
import type { PoLookups } from "./lookups";

export function NewPoDrawer({ projects, vendors, terms, items, openIndents }: PoLookups) {
  return (
    <NewRecordDrawer
      label="New purchase order"
      title="New purchase order"
      description="Raised against an approved indent, carrying only the shortfall the stock check left to buy."
    >
      <PoForm
        projects={projects}
        vendors={vendors}
        terms={terms}
        items={items}
        openIndents={openIndents}
        prefill={null}
      />
    </NewRecordDrawer>
  );
}
