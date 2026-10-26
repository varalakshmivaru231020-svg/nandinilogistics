import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope } from "@/lib/hr/list-filters";
import { PrintButton } from "./print-button";

export const metadata = { title: "ID card" };

/**
 * The rider's digital ID card — SOW §3.6 item 3: name, mobile, photo, Rider
 * ID, client company name, insurance number, emergency number and the main
 * company name. Drawn at card size, printable, and the same card the app
 * shares as an image.
 */
export default async function IdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.hr.employee.view, PERM.hr.employee.idCard);

  const rider = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    select: {
      id: true, name: true, mobile: true, employeeCode: true, photoKey: true,
      insuranceNumber: true, emergencyMobileFamily: true, emergencyMobileFriend: true,
      onboardingStatus: true, status: true, joinedOn: true,
      companies: { select: { company: { select: { name: true } } } },
      employmentType: { select: { name: true } },
    },
  });
  if (!rider) notFound();

  const initials = rider.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const clients = rider.companies.map((c) => c.company.name).join(" · ") || "—";
  const accepted = rider.onboardingStatus === "ACCEPTED" && rider.status !== "INACTIVE";

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-4 flex flex-wrap items-center gap-2.5 print:hidden">
        <Link
          href={`/hr/${rider.id}`}
          className="rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
        >
          ← {rider.name}
        </Link>
        <div className="flex-1" />
        <PrintButton />
      </div>

      {!accepted && (
        <p className="mb-3 rounded-[10px] border border-amber-200 bg-warn-050 px-3.5 py-2.5 text-[12px] font-medium text-warn-700 print:hidden">
          This card is a preview — it becomes valid once the rider is accepted and active.
        </p>
      )}

      <div
        id="id-card"
        className="mx-auto w-[420px] overflow-hidden rounded-[18px] border border-line-400 bg-white shadow-[0_16px_40px_rgba(25,26,92,.14)] print:shadow-none"
      >
        <div className="px-5 py-4 text-white" style={{ background: "linear-gradient(140deg,#0089C9,#2F308C)" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[.16em] opacity-90">Nandini Logistics</div>
          <div className="mt-0.5 font-display text-[15px] font-bold">Delivery Rider · ID Card</div>
        </div>

        <div className="flex gap-4 px-5 py-4">
          {rider.photoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/hr/photo/${rider.id}`} alt={rider.name} className="h-[112px] w-[96px] shrink-0 rounded-[12px] object-cover" />
          ) : (
            <span
              className="flex h-[112px] w-[96px] shrink-0 items-center justify-center rounded-[12px] font-display text-[34px] font-bold text-white"
              style={{ background: "#2F308C" }}
            >
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-display text-[18px] font-bold leading-tight text-navy-950">{rider.name}</div>
            <div className="num mt-1 text-[13px] font-bold text-brand-700">{rider.employeeCode}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
              <dt className="font-semibold text-muted-500">Mobile</dt>
              <dd className="num font-semibold text-navy-900">{rider.mobile}</dd>
              <dt className="font-semibold text-muted-500">Client</dt>
              <dd className="font-semibold text-navy-900">{clients}</dd>
              <dt className="font-semibold text-muted-500">Insurance</dt>
              <dd className="num font-semibold text-navy-900">{rider.insuranceNumber || "—"}</dd>
              <dt className="font-semibold text-muted-500">Emergency</dt>
              <dd className="num font-semibold text-navy-900">{rider.emergencyMobileFamily || rider.emergencyMobileFriend || "—"}</dd>
            </dl>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line-200 bg-surface-sunken px-5 py-2.5 text-[10.5px] font-semibold text-muted-500">
          <span>Main company: Nandini Logistics</span>
          <span className={accepted ? "text-good-700" : "text-warn-700"}>{accepted ? "Active rider" : "Not yet active"}</span>
        </div>
      </div>
    </div>
  );
}
