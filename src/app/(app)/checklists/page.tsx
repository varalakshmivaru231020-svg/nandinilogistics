import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PendingModuleBanner } from "@/components/pending-module-banner";
import { cn } from "@/lib/utils";

export const metadata = { title: "Checklist Management" };

/**
 * Checklist Management — preview only. See docs/PENDING_MODULES.md.
 * Structure and wording follow design/NN Infra Admin.dc.html.
 */
const CATEGORIES = [
  "Civil", "Plumbing", "Electrical", "Waterproofing",
  "Painting", "Safety", "Snagging", "Handover",
];

export default async function ChecklistsPage() {
  await requirePermission(PERM.checklist.checklist.view);

  return (
    <div className="animate-fade-up mx-auto max-w-[1400px]">
      <PendingModuleBanner module="Checklist Management" />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {["Library", "Runs at site"].map((t, i) => (
            <button
              key={t}
              type="button"
              disabled
              className={cn(
                "cursor-not-allowed rounded-[9px] border px-3.5 py-2 text-[12px] font-bold opacity-60",
                i === 0
                  ? "border-brand-500 bg-brand-100 text-brand-700"
                  : "border-line-400 bg-white text-muted-600",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-[1_1_220px] text-[11.5px] font-medium text-muted-600">
          Category → Checklist → Checkpoints, defined once and reused across every project.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3.5">
        {/* Categories rail */}
        <div className="min-w-[200px] flex-[0_1_230px] rounded-[13px] border border-line-400 bg-white p-2.5">
          <div className="flex items-center justify-between px-2.5 pb-2 pt-2">
            <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
              Categories
            </span>
            <button
              type="button"
              disabled
              className="grid h-[26px] w-[26px] cursor-not-allowed place-items-center rounded-[7px] bg-brand-100 text-[13px] font-extrabold text-brand-700 opacity-60"
            >
              +
            </button>
          </div>
          {CATEGORIES.map((c, i) => (
            <button
              key={c}
              type="button"
              disabled
              className={cn(
                "flex w-full cursor-not-allowed items-center justify-between rounded-[9px] px-2.5 py-2 text-left opacity-70",
                i === 0 ? "bg-surface-hover" : "",
              )}
            >
              <span className="text-[12.5px] font-semibold text-navy-600">{c}</span>
              <span className="num text-[11px] font-bold text-muted-400">0</span>
            </button>
          ))}
        </div>

        {/* Checklists in category */}
        <Card className="min-w-[240px] flex-[1_1_260px] px-4 py-4">
          <div className="flex flex-wrap items-start gap-2.5">
            <div className="min-w-0 flex-[1_1_140px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[15px] font-bold text-navy-950">Civil</span>
                <Badge tone="navy">0 CHECKLISTS</Badge>
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-muted-400">
                Structural and civil quality checks
              </p>
            </div>
            <Button size="sm" variant="secondary" disabled>New checklist</Button>
          </div>

          <div className="mt-4 rounded-[11px] border border-dashed border-line-400 px-4 py-12 text-center">
            <p className="font-display text-[14px] font-bold text-navy-950">
              No checklist data — the module is not built
            </p>
            <p className="mx-auto mt-1.5 max-w-lg text-[12px] font-medium leading-relaxed text-muted-600">
              The scope document specifies ordered checkpoints with response types of Yes/No,
              Pass/Fail, numeric with tolerance, remark and mandatory photo; triggered by project
              stage, unit type or task; a failed check raised automatically as a snag that must be
              cleared before the checklist can close; and unit-wise handover history retained with
              score, photos and sign-off.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {["checklist.checklist.view", "checklist.checklist.execute", "checklist.checklist.verify", "checklist.category.view"].map((c) => (
                <Badge key={c} tone="muted">{c}</Badge>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
