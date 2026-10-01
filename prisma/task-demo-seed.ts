import type { PrismaClient } from "@prisma/client";

/**
 * A worked example of both modules, for showing the system to someone.
 *
 * It writes a checklist with one item of each response type, and six tasks
 * standing at six different points of the lifecycle, so every screen has
 * something on it: a task waiting to be accepted, one under way, one overdue,
 * one waiting on its assigner, one part-way through its review levels, and one
 * closed with an extension behind it.
 *
 * It only ever adds what is missing — everything is keyed on a fixed number or
 * name — so it is safe to run twice and safe on a box that already has real
 * tasks on it.
 */
export async function seedTaskDemo(prisma: PrismaClient): Promise<{ tasks: number; checklists: number }> {
  const people = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { employeeCode: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (people.length < 3) return { tasks: 0, checklists: 0 };

  const pick = (email: string) => people.find((p) => p.email === email) ?? people[0];
  const admin = pick("owner@nninfra.example");
  const pm = pick("pm@nninfra.example");
  const supervisor = pick("supervisor@nninfra.example");
  const store = pick("store@nninfra.example");

  const project = await prisma.project.findFirst({ select: { id: true } });

  // ---- The checklist, with one item of each kind -------------------------
  const category = await prisma.checklistCategory.upsert({
    where: { code: "HANDOVER" },
    create: { code: "HANDOVER", name: "Handover", description: "Flat handover to the customer", sortOrder: 5 },
    update: {},
  });

  let checklists = 0;
  let list = await prisma.checklist.findFirst({ where: { name: "Flat handover checklist" } });
  if (!list) {
    list = await prisma.checklist.create({
      data: {
        categoryId: category.id,
        name: "Flat handover checklist",
        version: "v1.0",
        isActive: true,
        checkpoints: {
          create: [
            { text: "Snag list cleared and signed", responseType: "YES_NO_NA", isMandatory: true, needsFile: false, sortOrder: 1 },
            { text: "Electricity meter reading", responseType: "NUMBER", isMandatory: true, needsFile: false, sortOrder: 2 },
            { text: "Date keys handed over", responseType: "DATE", isMandatory: true, needsFile: false, sortOrder: 3 },
            { text: "Photograph of the handover", responseType: "YES_NO_NA", isMandatory: true, needsFile: true, sortOrder: 4 },
            { text: "Customer remarks", responseType: "TEXT", isMandatory: false, needsFile: false, sortOrder: 5 },
          ],
        },
      },
    });
    checklists = 1;
  }

  // ---- Six tasks, one at each point of the lifecycle ----------------------
  const day = 86_400_000;
  const now = Date.now();

  const plan = [
    {
      no: "T-9001", title: "Fire extinguisher check — Tower B", status: "PENDING" as const,
      priority: "HIGH" as const, due: now + 2 * day, assignee: supervisor, assigner: pm,
      location: "Tower B · all floors",
    },
    {
      no: "T-9002", title: "Plaster finishing — 6th floor", status: "STARTED" as const,
      priority: "MEDIUM" as const, due: now + 4 * day, assignee: supervisor, assigner: pm,
      location: "Tower B · Fl 6",
    },
    {
      no: "T-9003", title: "Drainage line pressure test", status: "STARTED" as const,
      priority: "HIGH" as const, due: now - 3 * day, assignee: store, assigner: pm,
      location: "Podium",
    },
    {
      no: "T-9004", title: "Scaffold removal — east face", status: "COMPLETED" as const,
      priority: "MEDIUM" as const, due: now - day, assignee: supervisor, assigner: pm,
      location: "Tower A · east",
    },
  ];

  let made = 0;
  for (const t of plan) {
    const exists = await prisma.task.findUnique({ where: { taskNo: t.no } });
    if (exists) continue;
    const due = new Date(t.due);
    await prisma.task.create({
      data: {
        taskNo: t.no,
        title: t.title,
        description: "Seeded so the screens have something on them.",
        kind: "STANDALONE",
        projectId: project?.id ?? null,
        location: t.location,
        assigneeId: t.assignee.id,
        createdById: t.assigner.id,
        priority: t.priority,
        status: t.status,
        dueAt: due,
        originalDueAt: due,
        effectiveDueAt: due,
        ...(t.status === "COMPLETED"
          ? { completedAt: new Date(now - day / 2), completionRemark: "Scaffold down, area swept." }
          : {}),
        ...(t.status === "STARTED" ? { acceptedAt: new Date(now - 2 * day), startedAt: new Date(now - day) } : {}),
        events: {
          create: {
            actorId: t.assigner.id, kind: "STATUS",
            summary: "Task raised and assigned", toStatus: "PENDING",
          },
        },
      },
    });
    made += 1;
  }

  // ---- A checklist task sitting at review level 2 -------------------------
  if (!(await prisma.task.findUnique({ where: { taskNo: "T-9005" } }))) {
    const due = new Date(now + 5 * day);
    const checkpoints = await prisma.checklistCheckpoint.findMany({
      where: { checklistId: list.id }, orderBy: { sortOrder: "asc" },
    });

    const task = await prisma.task.create({
      data: {
        taskNo: "T-9005",
        title: "Handover — Flat A-1203",
        description: "Hand the flat over and complete the checklist.",
        kind: "CHECKLIST",
        projectId: project?.id ?? null,
        location: "Tower A · Fl 12",
        assigneeId: supervisor.id,
        createdById: pm.id,
        priority: "HIGH",
        status: "UNDER_REVIEW",
        dueAt: due,
        originalDueAt: due,
        effectiveDueAt: due,
        acceptedAt: new Date(now - 3 * day),
        startedAt: new Date(now - 2 * day),
        completedAt: new Date(now - day),
        completionRemark: "Handed over, customer signed the snag list.",
        levels: {
          create: [
            { kind: "REVIEW", level: 1, userId: pm.id },
            { kind: "REVIEW", level: 2, userId: admin.id },
            { kind: "APPROVAL", level: 1, userId: admin.id },
          ],
        },
        checklists: { create: { checklistId: list.id, sortOrder: 0 } },
      },
      include: { checklists: true, levels: true },
    });

    const answers: Record<string, Record<string, unknown>> = {
      YES_NO_NA: { answerChoice: "Yes" },
      NUMBER: { answerNumber: 42815 },
      DATE: { answerDate: new Date(now - day) },
      TEXT: { answerText: "Asked for the balcony grill to be repainted." },
    };
    for (const cp of checkpoints) {
      await prisma.taskChecklistItem.create({
        data: {
          taskChecklistId: task.checklists[0].id,
          checkpointId: cp.id,
          answeredAt: new Date(now - day),
          ...(answers[cp.responseType] ?? {}),
        },
      });
    }

    // Review level 1 has passed, so level 2 is the one waiting.
    const level1 = task.levels.find((l) => l.kind === "REVIEW" && l.level === 1)!;
    await prisma.taskLevelAction.create({
      data: {
        levelId: level1.id, round: 1, decision: "PASS",
        remark: "Checked on site, readings match.", actorId: pm.id,
      },
    });
    await prisma.taskEvent.create({
      data: {
        taskId: task.id, actorId: pm.id, kind: "LEVEL",
        summary: "Reviewer level 1: pass", remark: "Checked on site, readings match.",
      },
    });
    made += 1;
  }

  // ---- A closed task carrying an uncontrollable extension -----------------
  if (!(await prisma.task.findUnique({ where: { taskNo: "T-9006" } }))) {
    const original = new Date(now - 10 * day);
    const revised = new Date(now - 6 * day);
    const task = await prisma.task.create({
      data: {
        taskNo: "T-9006",
        title: "Terrace waterproofing — Tower A",
        kind: "STANDALONE",
        projectId: project?.id ?? null,
        location: "Tower A · terrace",
        assigneeId: store.id,
        createdById: pm.id,
        priority: "MEDIUM",
        status: "CLOSED",
        dueAt: revised,
        originalDueAt: original,
        // Uncontrollable, so the date it is judged against moved with it.
        effectiveDueAt: revised,
        acceptedAt: new Date(now - 12 * day),
        startedAt: new Date(now - 11 * day),
        completedAt: new Date(now - 7 * day),
        completionRemark: "Two coats laid, ponding test clear.",
        closedAt: new Date(now - 6 * day),
        closureRemark: "Checked and accepted.",
      },
    });
    await prisma.taskExtension.create({
      data: {
        taskId: task.id,
        requestedById: store.id,
        proposedDueAt: revised,
        reason: "Four days of unseasonal rain — the slab never dried.",
        status: "APPROVED",
        decidedById: pm.id,
        decidedAt: new Date(now - 9 * day),
        decisionRemark: "Weather, not the team.",
        control: "UNCONTROLLABLE",
        revisedDueAt: revised,
        previousDueAt: original,
      },
    });
    made += 1;
  }

  if (made || checklists) {
    console.log(`  task demo: ${made} task(s), ${checklists} checklist(s) written`);
  }
  return { tasks: made, checklists };
}
