"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { cancelSiteVisitAction, completeSiteVisitAction, scheduleSiteVisitAction } from "./actions";

interface Visit {
  id: string; leadId: string; leadName: string; leadNo: string; leadPhone: string;
  leadState: string; scheduledAt: string; visitedAt: string | null;
  feedback: string | null; rating: number | null; conductedByName: string;
}

export function SiteVisitsScreen({
  visits, leads, projects, can, nowMs,
}: {
  nowMs: number;
  visits: Visit[];
  leads: Array<{ id: string; name: string; leadNo: string; projectId: string | null }>;
  projects: Array<{ id: string; name: string; code: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = React.useState(false);
  const [completing, setCompleting] = React.useState<Visit | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const pending = visits.filter((v) => !v.visitedAt);
  const done = visits.filter((v) => v.visitedAt);

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    const res = await cancelSiteVisitAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("Visit cancelled."); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {can.schedule && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setScheduling(true)}>
            <CalendarPlus className="h-3.5 w-3.5" />
            Schedule a visit
          </Button>
        </div>
      )}

      {visits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MapPin className="h-8 w-8" />}
            title="No site visits"
            description="Schedule a visit against a lead and it appears here until the outcome is recorded."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scheduled ({pending.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              {pending.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing scheduled.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pending.map((v) => {
                    const overdue = new Date(v.scheduledAt).getTime() < nowMs;
                    return (
                      <li key={v.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${overdue ? "bg-amber-50/50" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{v.leadName}</p>
                          <p className="text-xs text-slate-500">
                            {v.leadNo}
                            {can.viewContact && ` · ${v.leadPhone}`} · with {v.conductedByName}
                          </p>
                        </div>
                        <span className={`shrink-0 text-xs ${overdue ? "font-medium text-amber-700" : "text-slate-600"}`}>
                          {formatDateTime(v.scheduledAt)}
                          {overdue && " · due"}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          {can.complete && (
                            <Button size="xs" variant="success" onClick={() => setCompleting(v)}>
                              <Check className="h-3 w-3" />
                              Record outcome
                            </Button>
                          )}
                          {can.cancel && (
                            <Button size="xs" variant="ghost" loading={busy === v.id} onClick={() => cancel(v.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {done.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Completed ({done.length})</CardTitle></CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100">
                  {done.map((v) => (
                    <li key={v.id} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">{v.leadName}</span>
                        <div className="flex items-center gap-2">
                          {v.rating && <Badge tone={v.rating >= 4 ? "green" : v.rating >= 3 ? "amber" : "red"}>{v.rating}/5</Badge>}
                          <span className="text-xs text-slate-400">{formatDateTime(v.visitedAt)}</span>
                        </div>
                      </div>
                      {v.feedback && <p className="mt-0.5 text-xs text-slate-600">{v.feedback}</p>}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {scheduling && (
        <ScheduleModal
          leads={leads}
          projects={projects}
          onClose={() => setScheduling(false)}
          onDone={(m) => { setScheduling(false); setNotice(m); router.refresh(); }}
        />
      )}

      {completing && (
        <CompleteModal
          visit={completing}
          onClose={() => setCompleting(null)}
          onDone={(m) => { setCompleting(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ScheduleModal({
  leads, projects, onClose, onDone,
}: {
  leads: Array<{ id: string; name: string; leadNo: string; projectId: string | null }>;
  projects: Array<{ id: string; name: string; code: string }>;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [leadId, setLeadId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await scheduleSiteVisitAction(leadId, scheduledAt, projectId || null);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Site visit scheduled.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule a site visit"
      description="The lead moves to Site Visit Scheduled and the next-action date is set."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!leadId || !scheduledAt}>Schedule</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Lead" required>
          <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Select…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.leadNo})</option>)}
          </Select>
        </Field>
        <Field label="Project">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— From the lead —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="When" required>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CompleteModal({
  visit, onClose, onDone,
}: { visit: Visit; onClose: () => void; onDone: (m: string) => void }) {
  const [feedback, setFeedback] = React.useState("");
  const [rating, setRating] = React.useState("4");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await completeSiteVisitAction(visit.id, feedback, Number(rating));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Visit outcome recorded.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Visit outcome — ${visit.leadName}`}
      description="The lead moves to Visit Done."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={busy}>Save outcome</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Feedback">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} autoFocus
            placeholder="What did they think of the unit, the location, the price?" />
        </Field>
        <Field label="Interest rating">
          <Select value={rating} onChange={(e) => setRating(e.target.value)}>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} / 5</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
