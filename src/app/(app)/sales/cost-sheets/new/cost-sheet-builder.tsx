"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";
import { money, qty } from "@/lib/utils";
import { buildCostSheet, type ChargeHeadFacts } from "@/lib/sales/cost-sheet";
import { createCostSheetAction } from "../actions";

interface UnitOpt {
  id: string; unitNumber: string; floorNumber: number; status: string;
  superBuiltUpArea: number; parkingSlots: number; plcTag: string | null;
  projectId: string; projectCode: string; unitType: string | null;
}

interface Rate { baseRate: number; floorRise: number; plcAmount: number; name: string }

/**
 * The preview runs the very same `buildCostSheet` the server uses, so what the
 * executive sees before saving is what gets stored — not a second, drifting
 * implementation.
 */
export function CostSheetBuilder({
  units, leads, chargeHeads, rates, preselectedUnitId, preselectedLeadId,
}: {
  units: UnitOpt[];
  leads: Array<{ id: string; name: string; leadNo: string }>;
  chargeHeads: ChargeHeadFacts[];
  rates: Record<string, Rate>;
  preselectedUnitId?: string;
  preselectedLeadId?: string;
  canDiscount: boolean;
}) {
  const router = useRouter();
  const [unitId, setUnitId] = React.useState(
    preselectedUnitId && units.some((u) => u.id === preselectedUnitId) ? preselectedUnitId : units[0]?.id ?? "",
  );
  const [leadId, setLeadId] = React.useState(preselectedLeadId ?? "");
  const [discount, setDiscount] = React.useState("0");
  const [optional, setOptional] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const unit = units.find((u) => u.id === unitId);
  const rate = unit ? rates[unit.projectId] : undefined;

  // Optional heads the engine does not decide for itself.
  const optionalHeads = chargeHeads.filter(
    (h) => !h.isMandatory && !["BASE", "FLOORRISE", "PLC", "PARKING"].includes(h.code),
  );

  const preview = React.useMemo(() => {
    if (!unit || !rate) return null;
    return buildCostSheet(
      {
        unitNumber: unit.unitNumber,
        floorNumber: unit.floorNumber,
        superBuiltUpArea: unit.superBuiltUpArea,
        carpetArea: 0,
        parkingSlots: unit.parkingSlots,
        plcTag: unit.plcTag,
      },
      rate,
      chargeHeads,
      { discountAmount: Number(discount) || 0, includeOptional: [...optional] },
    );
  }, [unit, rate, chargeHeads, discount, optional]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createCostSheetAction(unitId, leadId || null, [...optional], Number(discount) || 0);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/sales/cost-sheets/${res.data.id}`);
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>Unit &amp; customer</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unit" required>
              <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.projectCode} · {u.unitNumber}
                    {u.unitType ? ` — ${u.unitType}` : ""} ({u.status.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Lead" hint="Links the quote to the enquiry it came from.">
              <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— Not linked —</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.leadNo})</option>)}
              </Select>
            </Field>
          </div>

          {unit && rate && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line-200 pt-3 text-xs text-muted-600">
              <span>Floor <strong>{unit.floorNumber}</strong></span>
              <span>Super built-up <strong className="num">{qty(unit.superBuiltUpArea, 0)}</strong> sq.ft</span>
              <span>Parking <strong className="num">{unit.parkingSlots}</strong></span>
              {unit.plcTag && <Badge tone="warn">{unit.plcTag}</Badge>}
              <span className="text-muted-400">Price list: {rate.name} @ {money(rate.baseRate)}/sq.ft</span>
            </div>
          )}

          {unit && !rate && (
            <Alert tone="error">
              No active price list for this unit&rsquo;s project. Create one before quoting.
            </Alert>
          )}
        </CardBody>
      </Card>

      {optionalHeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Optional charges</CardTitle>
            <span className="text-xs text-muted-500">Mandatory heads are always applied</span>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {optionalHeads.map((h) => {
              const on = optional.has(h.code);
              return (
                <button
                  key={h.code}
                  type="button"
                  onClick={() =>
                    setOptional((s) => {
                      const next = new Set(s);
                      if (next.has(h.code)) next.delete(h.code);
                      else next.add(h.code);
                      return next;
                    })
                  }
                  className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                    on ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line-400 bg-white text-muted-600 hover:bg-surface-hover"
                  }`}
                >
                  {h.name}
                  <span className="num ml-1.5 text-muted-400">{money(h.defaultValue)}</span>
                </button>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cost sheet</CardTitle>
          <span className="text-xs text-muted-500">Live preview — this is exactly what gets saved</span>
        </CardHeader>
        <CardBody>
          {!preview ? (
            <p className="py-6 text-center text-sm text-muted-500">Select a unit to generate the sheet.</p>
          ) : (
            <>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-400 text-xs uppercase tracking-wide text-muted-500">
                      <th className="py-2 text-left font-semibold">Charge</th>
                      <th className="py-2 text-right font-semibold">Qty</th>
                      <th className="py-2 text-right font-semibold">Rate</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                      <th className="py-2 text-right font-semibold">GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr key={l.code} className="border-b border-line-200">
                        <td className="py-2 text-navy-900">{l.label}</td>
                        <td className="num py-2 text-right text-muted-600">{qty(l.quantity, 2)}</td>
                        <td className="num py-2 text-right text-muted-600">{money(l.rate, true)}</td>
                        <td className="num py-2 text-right font-medium text-navy-950">{money(l.amount)}</td>
                        <td className="num py-2 text-right text-muted-500">
                          {l.taxPct > 0 ? `${money(l.taxAmount)} (${l.taxPct}%)` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-1.5 border-t border-line-400 pt-3">
                <div className="flex items-center justify-end gap-3 text-sm">
                  <span className="text-muted-500">Sub-total</span>
                  <span className="num w-40 text-right text-navy-900">{money(preview.subTotal)}</span>
                </div>
                <div className="flex items-center justify-end gap-3 text-sm">
                  <span className="text-muted-500">GST</span>
                  <span className="num w-40 text-right text-navy-900">{money(preview.taxAmount)}</span>
                </div>
                <div className="flex items-center justify-end gap-3 text-sm">
                  <span className="text-muted-500">Discount</span>
                  <Input
                    type="number" step="any" min={0} value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="num w-40 text-right"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-line-400 pt-2">
                  <span className="text-sm font-medium text-navy-600">Total consideration</span>
                  <span className="num w-40 text-right text-xl font-semibold text-navy-950">
                    {money(preview.totalAmount)}
                  </span>
                </div>
                {Number(discount) > 0 && (
                  <p className="pt-1 text-right text-xs text-warn-700">
                    A discount needs approval before this sheet can be booked.
                  </p>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={busy} disabled={!preview}>
          <Calculator className="h-3.5 w-3.5" />
          Save cost sheet
        </Button>
      </div>
    </div>
  );
}
