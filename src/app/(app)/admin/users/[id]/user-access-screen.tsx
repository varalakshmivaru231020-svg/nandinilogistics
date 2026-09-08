"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Save, Search, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { cn, formatDateTime } from "@/lib/utils";
import { setUserPermissionsAction, setUserProjectsAction, setUserRolesAction } from "../../actions";

type Effect = "ALLOW" | "DENY";

interface Props {
  userId: string;
  userName: string;
  isSuperAdmin: boolean;
  roles: Array<{ id: string; name: string; code: string; status: string; permissionCount: number }>;
  assignedRoleIds: string[];
  projects: Array<{ id: string; name: string; code: string; status: string }>;
  assignedProjectIds: string[];
  overrides: Array<{ code: string; effect: Effect }>;
  fromRoles: string[];
  effective: string[];
  permissions: Array<{ code: string; label: string; group: string; kind: string; module: string }>;
  activity: Array<{ id: string; action: string; entity: string; summary: string; createdAt: string }>;
  can: Record<string, boolean>;
}

type TabKey = "roles" | "permissions" | "projects" | "activity";

export function UserAccessScreen(props: Props) {
  const { can } = props;

  // Tabs are permission-gated individually, exactly like every other surface.
  const tabs = (
    [
      { key: "roles" as const, label: "Roles", show: can.tabRoles },
      { key: "permissions" as const, label: "Direct permissions", show: can.tabPermissions },
      { key: "projects" as const, label: "Project access", show: can.tabProjects },
      { key: "activity" as const, label: "Activity", show: can.tabActivity },
    ] satisfies Array<{ key: TabKey; label: string; show: boolean }>
  ).filter((t) => t.show);

  const [tab, setTab] = React.useState<TabKey>(tabs[0]?.key ?? "roles");

  if (tabs.length === 0) {
    return (
      <Alert tone="warn" title="Nothing to show">
        Your role does not include access to any of this user&rsquo;s access tabs.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {props.isSuperAdmin && (
        <Alert tone="warn" title="Super administrator">
          This account bypasses every permission check by design. Role and permission settings below
          are recorded but do not restrict it.
        </Alert>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roles" && <RolesTab {...props} />}
      {tab === "permissions" && <PermissionsTab {...props} />}
      {tab === "projects" && <ProjectsTab {...props} />}
      {tab === "activity" && <ActivityTab {...props} />}
    </div>
  );
}

/* ---------------------------------- Roles --------------------------------- */

function RolesTab({ userId, roles, assignedRoleIds, can, fromRoles }: Props) {
  const router = useRouter();
  const [selected, setSelected] = React.useState(new Set(assignedRoleIds));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);

  const dirty =
    selected.size !== assignedRoleIds.length ||
    assignedRoleIds.some((id) => !selected.has(id));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setUserRolesAction(userId, [...selected]);
    setBusy(false);
    if (!res.ok) setMsg({ tone: "error", text: res.error });
    else { setMsg({ tone: "success", text: "Roles updated." }); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone === "success" ? "success" : "error"}>{msg.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone="slate">{fromRoles.length} permissions from roles</Badge>
            {can.assignRoles && (
              <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
                <Save className="h-3.5 w-3.5" />
                Save roles
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {roles.map((r) => {
              const on = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={cn("flex items-center gap-3 px-4 py-2.5", can.assignRoles && "cursor-pointer hover:bg-slate-50")}
                  onClick={() => {
                    if (!can.assignRoles) return;
                    setSelected((s) => {
                      const next = new Set(s);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      return next;
                    });
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!can.assignRoles}
                    onChange={() => {}}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{r.name}</span>
                      {r.status !== "ACTIVE" && <Badge tone="slate">Inactive</Badge>}
                    </div>
                    <code className="text-xs text-slate-400">{r.code}</code>
                  </div>
                  <span className="num text-xs text-slate-500">{r.permissionCount} permissions</span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------- Direct overrides ---------------------------- */

function PermissionsTab({ userId, permissions, overrides, fromRoles, effective, can }: Props) {
  const router = useRouter();
  const roleSet = React.useMemo(() => new Set(fromRoles), [fromRoles]);
  const effectiveSet = React.useMemo(() => new Set(effective), [effective]);

  const [state, setState] = React.useState<Map<string, Effect>>(
    () => new Map(overrides.map((o) => [o.code, o.effect])),
  );
  const [search, setSearch] = React.useState("");
  const [onlySet, setOnlySet] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);

  const initial = React.useMemo(
    () => new Map(overrides.map((o) => [o.code, o.effect])),
    [overrides],
  );

  const dirty =
    state.size !== initial.size ||
    [...state].some(([code, effect]) => initial.get(code) !== effect);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return permissions.filter((p) => {
      if (onlySet && !state.has(p.code) && !term) return false;
      if (!term) return true;
      return p.code.toLowerCase().includes(term) || p.label.toLowerCase().includes(term);
    });
  }, [permissions, search, onlySet, state]);

  function set(code: string, effect: Effect | null) {
    setState((s) => {
      const next = new Map(s);
      if (effect === null) next.delete(code);
      else next.set(code, effect);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setUserPermissionsAction(
      userId,
      [...state].map(([code, effect]) => ({ code, effect })),
    );
    setBusy(false);
    if (!res.ok) setMsg({ tone: "error", text: res.error });
    else { setMsg({ tone: "success", text: "Direct permissions updated." }); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone === "success" ? "success" : "error"}>{msg.text}</Alert>}

      <Alert tone="info" title="How these combine">
        The user starts with the union of their roles&rsquo; permissions. An <strong>Allow</strong>{" "}
        here adds one on top; a <strong>Deny</strong> removes one the role granted. Deny always wins.
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all 468 permissions…" className="pl-8" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
          Show only overrides
        </label>
        <div className="flex-1" />
        <Badge tone="slate">{effectiveSet.size} effective</Badge>
        {can.assignPermissions && (
          <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" />
            Save overrides
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {onlySet && !search ? "No direct overrides on this user." : "No permissions match your search."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.slice(0, 300).map((p) => {
                const override = state.get(p.code);
                const viaRole = roleSet.has(p.code);
                const isEffective = override === "ALLOW" || (viaRole && override !== "DENY");

                return (
                  <li key={p.code} className="flex items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-slate-800">{p.label}</span>
                        <Badge tone="slate">{p.kind}</Badge>
                        {viaRole && <Badge tone="brand">via role</Badge>}
                        {isEffective ? (
                          <Badge tone="green">effective</Badge>
                        ) : (
                          <Badge tone="slate">not granted</Badge>
                        )}
                      </div>
                      <code className="text-[11px] text-slate-400">{p.code}</code>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={!can.assignPermissions}
                        onClick={() => set(p.code, override === "ALLOW" ? null : "ALLOW")}
                        className={cn(
                          "flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50",
                          override === "ALLOW"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
                        )}
                      >
                        <Check className="h-3 w-3" />
                        Allow
                      </button>
                      <button
                        type="button"
                        disabled={!can.assignPermissions}
                        onClick={() => set(p.code, override === "DENY" ? null : "DENY")}
                        className={cn(
                          "flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50",
                          override === "DENY"
                            ? "border-red-300 bg-red-50 text-red-700"
                            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
                        )}
                      >
                        <Ban className="h-3 w-3" />
                        Deny
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > 300 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Showing the first 300 of {filtered.length} matches — narrow the search to see the rest.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------- Projects -------------------------------- */

function ProjectsTab({ userId, projects, assignedProjectIds, can, effective }: Props) {
  const router = useRouter();
  const [selected, setSelected] = React.useState(new Set(assignedProjectIds));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);

  const seesAll = effective.includes("project.project.accessAll");
  const dirty =
    selected.size !== assignedProjectIds.length ||
    assignedProjectIds.some((id) => !selected.has(id));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setUserProjectsAction(userId, [...selected]);
    setBusy(false);
    if (!res.ok) setMsg({ tone: "error", text: res.error });
    else { setMsg({ tone: "success", text: "Project access updated." }); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone === "success" ? "success" : "error"}>{msg.text}</Alert>}

      {seesAll && (
        <Alert tone="warn" title="This user can access every project">
          They hold <code>project.project.accessAll</code>, so the mapping below does not restrict
          them. Remove that permission to scope them to specific projects.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Project mapping</CardTitle>
          {can.assignProjects && (
            <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
              <Save className="h-3.5 w-3.5" />
              Save mapping
            </Button>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => (
              <li
                key={p.id}
                className={cn("flex items-center gap-3 px-4 py-2.5", can.assignProjects && "cursor-pointer hover:bg-slate-50")}
                onClick={() => {
                  if (!can.assignProjects) return;
                  setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  });
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  disabled={!can.assignProjects}
                  onChange={() => {}}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{p.name}</p>
                  <code className="text-xs text-slate-400">{p.code}</code>
                </div>
                <Badge tone={p.status === "ACTIVE" ? "green" : "slate"}>{p.status}</Badge>
              </li>
            ))}
            {projects.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-500">No projects created yet.</li>
            )}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------- Activity -------------------------------- */

function ActivityTab({ activity }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {activity.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No recorded activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-700">{a.summary}</p>
                  <p className="text-xs text-slate-400">
                    {a.entity} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <Badge tone={a.action === "DELETE" ? "red" : a.action === "CREATE" ? "green" : "slate"}>
                  {a.action}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
