import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { NewTaskForm } from "./new-task-form";

export const metadata = { title: "New task" };

export default async function NewTaskPage() {
  const ctx = await requirePermission(PERM.task.task.create);

  const [projects, people, checklists] = await Promise.all([
    prisma.project.findMany({
      where: ctx.canAccessAllProjects ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: ctx.projectIds } },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, employeeCode: true, phone: true,
        roles: { select: { role: { select: { name: true } } }, take: 1 },
      },
    }),
    prisma.checklist.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        category: { select: { name: true } },
        _count: { select: { checkpoints: true } },
      },
    }),
  ]);

  return (
    <NewTaskForm
      projects={projects}
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        hint: [p.employeeCode, p.roles[0]?.role.name].filter(Boolean).join(" · "),
        keywords: p.phone ?? "",
      }))}
      checklists={checklists.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category.name,
        points: c._count.checkpoints,
      }))}
    />
  );
}
