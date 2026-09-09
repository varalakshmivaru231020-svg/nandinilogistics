import { Lock } from "lucide-react";

/**
 * Task and Checklist management are held pending client verification. The
 * screens are built to the design so the client can see and sign off on them,
 * but nothing on them writes: there are no tables, no actions and no data.
 */
export function PendingModuleBanner({ module }: { module: string }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[12px] border border-warn-050 bg-warn-050 px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-white text-warn-700">
        <Lock className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-warn-800">
          {module} is pending client verification — this screen is a preview
        </p>
        <p className="mt-0.5 text-[11.5px] font-medium text-warn-700">
          The layout matches the approved design and its permissions are already registered and
          assignable, but nothing here saves. The tables and actions are deliberately not built.
        </p>
      </div>
    </div>
  );
}
