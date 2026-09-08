"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Lock, Save, Search, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { setRolePermissionsAction } from "../../actions";

interface PermRow {
  code: string;
  module: string;
  resource: string;
  action: string;
  label: string;
  description: string | null;
  group: string;
  kind: string;
}

const KIND_TONE: Record<string, "slate" | "brand" | "green" | "amber" | "violet" | "sky"> = {
  PAGE: "brand",
  TAB: "sky",
  BUTTON: "green",
  ACTION: "violet",
  FIELD: "amber",
  REPORT: "slate",
};

/**
 * The role permission matrix — 468 codes grouped so they can actually be
 * reasoned about. Selection is local until saved, and the pending delta is
 * shown before the user commits it.
 */
export function PermissionMatrix({
  roleId,
  roleName,
  granted,
  permissions,
  modules,
  readOnly,
  users,
}: {
  roleId: string;
  roleName: string;
  granted: string[];
  permissions: PermRow[];
  modules: Array<{ key: string; label: string; pending?: boolean }>;
  readOnly: boolean;
  users: Array<{ id: string; name: string; email: string; status: string }>;
}) {
  const router = useRouter();
  const initial = React.useMemo(() => new Set(granted), [granted]);

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(granted));
  const [search, setSearch] = React.useState("");
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);

  const moduleLabel = React.useMemo(
    () => new Map(modules.map((m) => [m.key, m.label])),
    [modules],
  );
  const pendingModules = React.useMemo(
    () => new Set(modules.filter((m) => m.pending).map((m) => m.key)),
    [modules],
  );

  /* ------------------------------ grouping ------------------------------- */

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return permissions;
    return permissions.filter(
      (p) =>
        p.code.toLowerCase().includes(term) ||
        p.label.toLowerCase().includes(term) ||
        p.group.toLowerCase().includes(term),
    );
  }, [permissions, search]);

  const groups = React.useMemo(() => {
    const map = new Map<string, PermRow[]>();
    for (const p of filtered) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()].map(([group, perms]) => ({
      group,
      module: perms[0].module,
      perms,
    }));
  }, [filtered]);

  // While a search is active every matching group is shown expanded. Derived
  // rather than pushed into state, so the user's manual toggles survive.
  const searching = search.trim().length > 0;

  /* ------------------------------ selection ------------------------------ */

  function toggle(code: string) {
    if (readOnly) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function setMany(codes: string[], on: boolean) {
    if (readOnly) return;
    setSelected((s) => {
      const next = new Set(s);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });
  }

  const added = [...selected].filter((c) => !initial.has(c));
  const removed = [...initial].filter((c) => !selected.has(c));
  const dirty = added.length > 0 || removed.length > 0;

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await setRolePermissionsAction(roleId, [...selected]);
    setBusy(false);
    if (!res.ok) setMessage({ tone: "error", text: res.error });
    else {
      setMessage({ tone: "success", text: `Saved. ${roleName} now holds ${res.data.granted} permissions.` });
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.tone === "success" ? "success" : "error"}>{message.text}</Alert>}

      {readOnly && (
        <Alert tone="warn" title="Read-only">
          You can see this matrix but not change it — that needs the &ldquo;Edit the role permission
          matrix&rdquo; permission.
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions by name or code…"
            className="pl-8"
          />
        </div>

        <Badge tone="slate">
          {selected.size} of {permissions.length} granted
        </Badge>

        <div className="flex-1" />

        {dirty && (
          <>
            <span className="text-xs text-slate-500">
              {added.length > 0 && <span className="text-emerald-600">+{added.length}</span>}
              {added.length > 0 && removed.length > 0 && " / "}
              {removed.length > 0 && <span className="text-red-600">−{removed.length}</span>}
              {" pending"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setSelected(new Set(initial)); setMessage(null); }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
          </>
        )}

        {!readOnly && (
          <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" />
            Save changes
          </Button>
        )}
      </div>

      {/* Groups */}
      <div className="space-y-2">
        {groups.map(({ group, module, perms }) => {
          const codes = perms.map((p) => p.code);
          const on = codes.filter((c) => selected.has(c)).length;
          const allOn = on === codes.length;
          const isOpen = searching || openGroups.has(group);
          const isPending = pendingModules.has(module);

          return (
            <Card key={group} className={cn(isPending && "border-dashed")}>
              <CardHeader className="cursor-pointer select-none" onClick={() =>
                setOpenGroups((s) => {
                  const next = new Set(s);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                })
              }>
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", !isOpen && "-rotate-90")} />
                  <CardTitle className="truncate">{group}</CardTitle>
                  {isPending && (
                    <Badge tone="amber" className="shrink-0">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Pending verification
                    </Badge>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">{moduleLabel.get(module)}</span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("num text-xs", allOn ? "text-emerald-600" : on > 0 ? "text-amber-600" : "text-slate-400")}>
                    {on} / {codes.length}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMany(codes, !allOn); }}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
              </CardHeader>

              {isOpen && (
                <CardBody className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {perms.map((p) => {
                      const isOn = selected.has(p.code);
                      const changed = isOn !== initial.has(p.code);
                      return (
                        <li
                          key={p.code}
                          className={cn(
                            "flex items-start gap-3 px-4 py-2.5",
                            changed && (isOn ? "bg-emerald-50/60" : "bg-red-50/60"),
                            !readOnly && "cursor-pointer hover:bg-slate-50",
                          )}
                          onClick={() => toggle(p.code)}
                        >
                          <input
                            type="checkbox"
                            checked={isOn}
                            disabled={readOnly}
                            onChange={() => toggle(p.code)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm text-slate-800">{p.label}</span>
                              <Badge tone={KIND_TONE[p.kind] ?? "slate"}>{p.kind}</Badge>
                            </div>
                            {p.description && (
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.description}</p>
                            )}
                            <code className="mt-0.5 block text-[11px] text-slate-400">{p.code}</code>
                          </div>
                          {readOnly && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />}
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              )}
            </Card>
          );
        })}

        {groups.length === 0 && (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">No permissions match &ldquo;{search}&rdquo;.</p>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Who holds this role */}
      {users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Users holding this role ({users.length})</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <Badge tone={u.status === "ACTIVE" ? "green" : "slate"}>{u.status}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
