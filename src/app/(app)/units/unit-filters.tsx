"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ImportDialog } from "@/components/import/import-dialog";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { UNIT_IMPORT_COLUMNS } from "@/lib/units/unit-import";
import { UNIT_STATUSES } from "@/lib/units/unit-list";
import { importUnitsAction, previewUnitImportAction } from "./actions";

type Option = { value: string; label: string };

export function UnitFilters({
  projects, blocks, unitTypes, total, can,
}: {
  projects: Option[];
  blocks: Option[];
  unitTypes: Option[];
  total: number;
  can: { export: boolean; import: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [importing, setImporting] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  return (
    <>
      {notice && <Alert tone="success">{notice}</Alert>}
      <ListToolbar
        className="mb-0"
        searchPlaceholder="Search unit number…"
        count={total}
        filters={[
          { name: "project", label: "Projects", options: projects },
          { name: "block", label: "Blocks", options: blocks },
          { name: "type", label: "Unit types", options: unitTypes },
          { name: "status", label: "Statuses", options: UNIT_STATUSES.map((s) => ({ value: s, label: s })) },
        ]}
      >
        {can.import && (
          <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        )}
        {can.export && (
          <ExportMenu href={(format) => exportHref("/api/units/export", format, params)} disabled={total === 0} />
        )}
      </ListToolbar>

      {importing && (
        <ImportDialog
          title="Import units"
          description="Upload a .csv or .xlsx. Projects are matched by code, blocks by name within the project. Every unit starts Available."
          columns={UNIT_IMPORT_COLUMNS}
          templateName="units"
          preview={previewUnitImportAction}
          commit={importUnitsAction}
          onClose={() => setImporting(false)}
          onImported={(m) => { setImporting(false); setNotice(m); router.refresh(); }}
        />
      )}
    </>
  );
}
