import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { NewTaskForm } from "./new-task-form";

export const metadata = { title: "New task" };

export default async function NewTaskPage() {
  await requirePermission(PERM.task.task.create);

  // Whoever may work a task is a Team Leader, by their grant — the same pool
  // the mobile form's "teamLeaders" source lists.
  const leaderIds = await usersHolding(prisma, PERM.task.task.start);
  const people = await prisma.user.findMany({
    where: { id: { in: leaderIds }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, employeeCode: true, phone: true,
      roles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  });

  return (
    <NewTaskForm
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        hint: [p.employeeCode, p.roles[0]?.role.name].filter(Boolean).join(" · "),
        keywords: p.phone ?? "",
      }))}
    />
  );
}
