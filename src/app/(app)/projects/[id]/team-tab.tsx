"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field } from "@/components/ui/primitives";
import { mapUserToProjectAction, removeUserFromProjectAction } from "../actions";

export interface TeamRole {
  role: string;
  dot: string;
  members: Array<{ id: string; userId: string; name: string }>;
}

/**
 * The design's team mapping: one row per role, the people mapped to it as
 * chips, and a "+ Map user" that grants access by mapping — access follows the
 * mapping, which is what the heading says.
 */
export function TeamTab({
  projectId, roles, assignable, can,
}: {
  projectId: string;
  roles: TeamRole[];
  assignable: Array<{ id: string; name: string; designation: string | null }>;
  can: { assign: boolean; remove: boolean };
}) {
  const router = useRouter();
  const [mapping, setMapping] = React.useState<string | null>(null);
  const [pick, setPick] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function map() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const res = await mapUserToProjectAction(projectId, pick);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setMapping(null); setPick(""); router.refresh(); }
  }

  async function unmap(userId: string) {
    setError(null);
    const res = await removeUserFromProjectAction(projectId, userId);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
        Team mapping · access follows mapping
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}

      {roles.map((r) => (
        <div key={r.role} className="flex items-center gap-[11px] border-b border-line-100 py-2.5 last:border-0">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: r.dot }} />
          <span className="w-[118px] shrink-0 text-[12px] font-bold text-navy-600">{r.role}</span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {r.members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-400 bg-surface-field py-[5px] pl-[11px] pr-[6px] text-[11.5px] font-semibold text-navy-900"
              >
                {m.name}
                {can.remove && (
                  <button
                    type="button"
                    onClick={() => unmap(m.userId)}
                    className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-line-250 text-[10px] font-semibold text-muted-600 transition-colors hover:bg-bad-050 hover:text-bad-600"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {r.members.length === 0 && (
              <span className="self-center text-[11.5px] font-medium text-[#C0C5DC]">not mapped</span>
            )}
          </div>
          {can.assign && (
            <button
              type="button"
              onClick={() => { setMapping(r.role); setPick(""); }}
              className="shrink-0 cursor-pointer rounded-full border border-dashed border-muted-200 bg-surface-tint px-[11px] py-[5px] text-[11px] font-semibold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
            >
              + Map user
            </button>
          )}
        </div>
      ))}

      <Modal
        open={mapping !== null}
        onClose={() => setMapping(null)}
        title={`Map a user as ${mapping ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setMapping(null)}>Cancel</Button>
            <Button loading={busy} onClick={map} disabled={!pick}>Map user</Button>
          </>
        }
      >
        <Field label="User" hint="Access follows the mapping — a mapped user sees this project.">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="w-full rounded-[9px] border border-line-400 bg-surface-field px-3 py-2 text-[12.5px] text-navy-900"
          >
            <option value="">Pick a user…</option>
            {assignable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.designation ? ` · ${u.designation}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </div>
  );
}
