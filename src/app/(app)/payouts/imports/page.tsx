import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { importListWhere, readImportListParams } from "@/lib/payouts/list-filters";
import { importSummaryOf } from "@/lib/payouts/list-display";
import { ImportsScreen } from "./imports-screen";

export const metadata = { title: "Payout sheets" };

/** Every payout sheet imported, draft and posted — Admin's review queue. */
export default async function PayoutImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.payout.import.view);
  const params = readImportListParams(await searchParams);

  const [imports, companies] = await Promise.all([
    prisma.payoutImport.findMany({
      where: importListWhere(params),
      orderBy: { createdAt: "desc" },
      select: {
        id: true, fileName: true, status: true, periodFrom: true, periodTo: true, createdAt: true, postedAt: true,
        company: { select: { name: true } },
        uploadedBy: { select: { name: true } },
        lines: { select: { employeeId: true, finalPayout: true } },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ImportsScreen
      imports={imports.map((i) => ({
        id: i.id,
        fileName: i.fileName,
        status: i.status,
        company: i.company.name,
        periodFrom: i.periodFrom.toISOString(),
        periodTo: i.periodTo.toISOString(),
        createdAt: i.createdAt.toISOString(),
        uploadedBy: i.uploadedBy.name,
        lines: i.lines.length,
        unmatched: i.lines.filter((l) => !l.employeeId).length,
        total: i.lines.reduce((s, l) => s + Number(l.finalPayout), 0),
      }))}
      summary={importSummaryOf(imports)}
      companies={companies}
      picked={{ company: params.company, status: params.status }}
      q={params.q}
      can={{
        create: ctx.has(PERM.payout.import.create),
        post: ctx.has(PERM.payout.import.post),
        delete: ctx.has(PERM.payout.import.delete),
        export: ctx.has(PERM.payout.import.export),
      }}
    />
  );
}
