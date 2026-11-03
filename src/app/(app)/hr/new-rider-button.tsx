import Link from "next/link";

import { Can } from "@/components/rbac/can";
import { PERM } from "@/lib/permissions/codes";

/** "+ New rider" outside the Riders list — opens the same page, on type Rider. */
export function NewRiderButton() {
  return (
    <Can I={PERM.hr.employee.create}>
      <Link
        href="/hr/new?type=riders"
        className="inline-flex items-center rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
      >
        + New rider
      </Link>
    </Can>
  );
}
