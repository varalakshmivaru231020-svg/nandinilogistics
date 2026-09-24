"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerStep } from "@/components/ui/drawer";
import { Alert, Input } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { createProjectAction } from "./actions";

type Lookup = Array<{ id: string; name: string }>;

/**
 * The design's Create project panel, field for field. The grid is TWO columns
 * and each field declares its span; CSS grid auto-placement then produces the
 * design's exact shape — a span-2 field cannot sit beside a span-1, so name,
 * location and RERA each take a row of their own, code and land area sit alone
 * beside the gap, and the last six pair up.
 */
const FIELDS: Array<{
  name: string; label: string; placeholder: string; span: 1 | 2;
  required?: boolean; type?: string; date?: boolean;
}> = [
  { name: "name", label: "Project name", placeholder: "e.g. NN Lakefront", span: 2, required: true },
  { name: "code", label: "Project code", placeholder: "PRJ-005", span: 1, required: true },
  { name: "addressLine", label: "Location", placeholder: "Area, city", span: 2 },
  { name: "landAreaText", label: "Land area", placeholder: "4.2 acres", span: 1 },
  { name: "reraNumber", label: "RERA registration no.", placeholder: "PRM/KA/RERA/…", span: 2 },
  { name: "approvalDetails", label: "Approval details", placeholder: "plan sanction ref.", span: 1 },
  { name: "totalTowers", label: "Towers / blocks", placeholder: "2", span: 1, type: "number" },
  { name: "totalFloors", label: "Floors per tower", placeholder: "18", span: 1, type: "number" },
  { name: "totalUnits", label: "Total units", placeholder: "456", span: 1, type: "number" },
  { name: "startDate", label: "Planned start", placeholder: "01 Apr 2027", span: 1, date: true },
  { name: "targetDate", label: "Target completion", placeholder: "31 Dec 2029", span: 1, date: true },
];

export function NewProjectButton({ types }: { types: Lookup }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");

  function reset() {
    setOpen(false);
    setError(null);
    setTypeId(types[0]?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectTypeId", typeId);
    const res = await createProjectAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    reset();
    router.push(`/projects/${res.data.id}`);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
+ New project
      </Button>

      {open && (
        <Drawer
          open
          onClose={reset}
          title="Create project"
          description="The project master — the breakdown is built on the project itself"
          footer={
            <>
              <Button variant="outline" type="button" onClick={reset}>Cancel</Button>
              <Button type="submit" form="project-form" loading={busy}>Create project</Button>
            </>
          }
        >
          <form id="project-form" onSubmit={onSubmit}>
            {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

            <DrawerStep n={1} className="mb-3.5">Project master</DrawerStep>

            {/* The design's two-column field grid */}
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label
                  key={f.name}
                  className={cn("block min-w-0", f.span === 2 && "col-span-2")}
                >
                  <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">
                    {f.label}
                  </span>
                  {f.date ? (
                    <DateField name={f.name} placeholder={f.placeholder} required={f.required} />
                  ) : (
                    <Input
                      name={f.name}
                      type={f.type ?? "text"}
                      placeholder={f.placeholder}
                      required={f.required}
                      className={f.name === "code" ? "uppercase" : undefined}
                    />
                  )}
                </label>
              ))}
            </div>

            {/* Project type — the design's pill chips, not a dropdown */}
            <div className="mt-3.5">
              <p className="mb-[7px] text-[11px] font-semibold text-muted-600">Project type</p>
              <div className="flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-colors",
                      typeId === t.id
                        ? "border-brand-500 bg-brand-100 text-brand-700"
                        : "border-line-400 bg-white text-navy-500 hover:bg-surface-hover",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

          </form>
        </Drawer>
      )}
    </>
  );
}
