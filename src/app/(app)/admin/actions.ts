"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { PERM } from "@/lib/permissions/codes";

/* ========================================================================== */
/* Roles                                                                       */
/* ========================================================================== */

const RoleSchema = z.object({
  code: z.string().trim().min(2, "Code is required").regex(/^[A-Z0-9_]+$/, "Use uppercase letters, digits and underscores only"),
  name: z.string().trim().min(2, "Name is required"),
  description: z.string().trim().optional(),
  level: z.coerce.number().int().min(1).max(999),
});

export async function createRoleAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.create);
    const parsed = RoleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const role = await prisma.role.create({ data: { ...parsed.data, isSystem: false } });
    await recordAudit({
      action: "CREATE", entity: "Role", entityId: role.id, userId: ctx.id,
      summary: `Created role ${role.name}`,
    });
    revalidatePath("/admin/roles");
    return { id: role.id };
  });
}

export async function updateRoleAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.update);
    const parsed = RoleSchema.partial({ code: true }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const before = await prisma.role.findUnique({ where: { id } });
    if (!before) throw new Error("Role not found.");

    // A system role's code is referenced in seeds and integrations — never rename it.
    const data = before.isSystem ? { ...parsed.data, code: before.code } : parsed.data;
    const after = await prisma.role.update({ where: { id }, data });

    await recordAudit({
      action: "UPDATE", entity: "Role", entityId: id, userId: ctx.id,
      summary: `Updated role ${after.name}`, changes: diff(before, after),
    });
    revalidatePath("/admin/roles");
    return null;
  });
}

export async function deleteRoleAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.delete);
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new Error("Role not found.");
    if (role.isSystem) throw new Error("System roles cannot be deleted. Deactivate it instead.");
    if (role._count.users > 0) {
      throw new Error(`${role._count.users} user(s) still hold this role. Reassign them first.`);
    }

    await prisma.role.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "Role", entityId: id, userId: ctx.id,
      summary: `Deleted role ${role.name}`,
    });
    revalidatePath("/admin/roles");
    return null;
  });
}

export async function cloneRoleAction(id: string, name: string, code: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.clone);
    const source = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!source) throw new Error("Role not found.");

    const clone = await prisma.role.create({
      data: {
        code: code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
        name,
        description: `Cloned from ${source.name}`,
        level: source.level,
        isSystem: false,
        permissions: {
          createMany: { data: source.permissions.map((p) => ({ permissionId: p.permissionId })) },
        },
      },
    });

    await recordAudit({
      action: "CREATE", entity: "Role", entityId: clone.id, userId: ctx.id,
      summary: `Cloned role ${source.name} into ${name} with ${source.permissions.length} permissions`,
    });
    revalidatePath("/admin/roles");
    return { id: clone.id };
  });
}

export async function toggleRoleStatusAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.toggleStatus);
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new Error("Role not found.");

    const status = role.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await prisma.role.update({ where: { id }, data: { status } });
    await recordAudit({
      action: "UPDATE", entity: "Role", entityId: id, userId: ctx.id,
      summary: `${status === "ACTIVE" ? "Activated" : "Deactivated"} role ${role.name}`,
    });
    revalidatePath("/admin/roles");
    return null;
  });
}

/**
 * Replaces a role's permission set. This is the screen that decides what every
 * other screen shows, so the audit entry records the exact delta.
 */
export async function setRolePermissionsAction(
  roleId: string,
  codes: string[],
): Promise<ActionResult<{ granted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.role.managePermissions);

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    if (!role) throw new Error("Role not found.");

    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });

    const before = new Set(role.permissions.map((p) => p.permission.code));
    const after = new Set(permissions.map((p) => p.code));
    const added = [...after].filter((c) => !before.has(c));
    const removed = [...before].filter((c) => !after.has(c));

    if (added.length === 0 && removed.length === 0) {
      return { granted: after.size };
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);

    await recordAudit({
      action: "UPDATE",
      entity: "Role",
      entityId: roleId,
      userId: ctx.id,
      summary: `Changed permissions on ${role.name}: +${added.length} / −${removed.length} (now ${after.size})`,
      changes: { granted: { from: added.length ? removed : [...before], to: added.length ? added : [...after] } },
    });

    revalidatePath("/admin/roles");
    return { granted: after.size };
  });
}

/* ========================================================================== */
/* Users                                                                       */
/* ========================================================================== */

const UserSchema = z.object({
  employeeCode: z.string().trim().min(1, "Employee code is required"),
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  designationId: z.string().trim().optional(),
});

export async function createUserAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.create);
    const parsed = UserSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const password = String(formData.get("password") ?? "");
    const strength = validatePasswordStrength(password);
    if (strength) throw new Error(strength);

    const user = await prisma.user.create({
      data: {
        ...parsed.data,
        departmentId: parsed.data.departmentId || null,
        designationId: parsed.data.designationId || null,
        phone: parsed.data.phone || null,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        createdById: ctx.id,
      },
    });

    const roleId = String(formData.get("roleId") ?? "");
    if (roleId) await prisma.userRole.create({ data: { userId: user.id, roleId } });

    await recordAudit({
      action: "CREATE", entity: "User", entityId: user.id, userId: ctx.id,
      summary: `Created user ${user.name} (${user.email})`,
    });
    revalidatePath("/admin/users");
    return { id: user.id };
  });
}

export async function updateUserAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.update);
    const parsed = UserSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new Error("User not found.");

    const after = await prisma.user.update({
      where: { id },
      data: {
        ...parsed.data,
        departmentId: parsed.data.departmentId || null,
        designationId: parsed.data.designationId || null,
        phone: parsed.data.phone || null,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "User", entityId: id, userId: ctx.id,
      summary: `Updated user ${after.name}`,
      changes: diff(before, after, ["updatedAt", "createdAt", "id", "passwordHash"]),
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function toggleUserStatusAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.toggleStatus);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("User not found.");
    if (user.id === ctx.id) throw new Error("You cannot deactivate your own account.");

    const status = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await prisma.user.update({ where: { id }, data: { status } });

    // Deactivating must take effect immediately, not at token expiry.
    if (status === "INACTIVE") {
      await prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await recordAudit({
      action: "UPDATE", entity: "User", entityId: id, userId: ctx.id,
      summary: `${status === "ACTIVE" ? "Activated" : "Deactivated"} user ${user.name}`,
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function resetPasswordAction(id: string, password: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.resetPassword);
    const strength = validatePasswordStrength(password);
    if (strength) throw new Error(strength);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("User not found.");

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit({
      action: "UPDATE", entity: "User", entityId: id, userId: ctx.id,
      summary: `Reset password for ${user.name} and signed out all their devices`,
    });
    return null;
  });
}

export async function setUserRolesAction(userId: string, roleIds: string[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.assignRoles);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) throw new Error("User not found.");

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } });

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.id })),
        skipDuplicates: true,
      }),
    ]);

    await recordAudit({
      action: "ASSIGN", entity: "User", entityId: userId, userId: ctx.id,
      summary: `Set roles for ${user.name}: ${roles.map((r) => r.name).join(", ") || "none"}`,
      changes: {
        roles: {
          from: user.roles.map((r) => r.role.name),
          to: roles.map((r) => r.name),
        },
      },
    });
    revalidatePath("/admin/users");
    return null;
  });
}

/** Per-user overrides layered on top of role grants. DENY always wins. */
export async function setUserPermissionsAction(
  userId: string,
  overrides: Array<{ code: string; effect: "ALLOW" | "DENY" }>,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.assignPermissions);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found.");

    const perms = await prisma.permission.findMany({
      where: { code: { in: overrides.map((o) => o.code) } },
      select: { id: true, code: true },
    });
    const byCode = new Map(perms.map((p) => [p.code, p.id]));

    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId } }),
      prisma.userPermission.createMany({
        data: overrides
          .filter((o) => byCode.has(o.code))
          .map((o) => ({ userId, permissionId: byCode.get(o.code)!, effect: o.effect })),
        skipDuplicates: true,
      }),
    ]);

    const allows = overrides.filter((o) => o.effect === "ALLOW").length;
    const denies = overrides.filter((o) => o.effect === "DENY").length;

    await recordAudit({
      action: "ASSIGN", entity: "User", entityId: userId, userId: ctx.id,
      summary: `Set direct permissions for ${user.name}: ${allows} allowed, ${denies} denied`,
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function setUserProjectsAction(userId: string, projectIds: string[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.user.assignProjects);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found.");

    await prisma.$transaction([
      prisma.userProject.deleteMany({ where: { userId } }),
      prisma.userProject.createMany({
        data: projectIds.map((projectId) => ({ userId, projectId })),
        skipDuplicates: true,
      }),
    ]);

    await recordAudit({
      action: "ASSIGN", entity: "User", entityId: userId, userId: ctx.id,
      summary: `Mapped ${user.name} to ${projectIds.length} project(s)`,
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.session.revoke);
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { name: true } } },
    });
    if (!session) throw new Error("Session not found.");

    await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await recordAudit({
      action: "UPDATE", entity: "Session", entityId: sessionId, userId: ctx.id,
      summary: `Revoked a session for ${session.user.name}`,
    });
    revalidatePath("/admin/sessions");
    return null;
  });
}

/* ========================================================================== */
/* Approval limits                                                             */
/* ========================================================================== */

export async function upsertApprovalLimitAction(formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.approvalLimit.create);
    const scope = String(formData.get("scope") ?? "").trim();
    const roleId = String(formData.get("roleId") ?? "") || null;
    const userId = String(formData.get("userId") ?? "") || null;
    const maxValue = Number(formData.get("maxValue") ?? 0);

    if (!scope) throw new Error("Approval scope is required.");
    if (!roleId && !userId) throw new Error("Choose either a role or a specific user.");
    if (roleId && userId) throw new Error("Set the limit on a role or on a user, not both.");
    if (!(maxValue > 0)) throw new Error("Enter a limit greater than zero.");

    const existing = await prisma.approvalLimit.findFirst({ where: { scope, roleId, userId } });
    if (existing) {
      await prisma.approvalLimit.update({ where: { id: existing.id }, data: { maxValue } });
    } else {
      await prisma.approvalLimit.create({ data: { scope, roleId, userId, maxValue } });
    }

    await recordAudit({
      action: "UPDATE", entity: "ApprovalLimit", userId: ctx.id,
      summary: `Set ${scope} approval limit to ₹${maxValue.toLocaleString("en-IN")}`,
    });
    revalidatePath("/admin/approval-limits");
    return null;
  });
}

export async function deleteApprovalLimitAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.approvalLimit.delete);
    const limit = await prisma.approvalLimit.findUnique({ where: { id } });
    if (!limit) throw new Error("Approval limit not found.");

    await prisma.approvalLimit.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "ApprovalLimit", entityId: id, userId: ctx.id,
      summary: `Removed the ${limit.scope} approval limit`,
    });
    revalidatePath("/admin/approval-limits");
    return null;
  });
}
