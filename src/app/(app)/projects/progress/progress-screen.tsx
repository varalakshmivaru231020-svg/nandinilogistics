"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, MapPin, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { progressEmpty } from "@/lib/projects/progress-display";
import { formatDate } from "@/lib/utils";
import { createProgressLogAction, deleteProgressLogAction } from "./actions";

interface Log {
  id: string; logDate: string; title: string; notes: string | null;
  manpowerCount: number; weather: string | null;
  latitude: number | null; longitude: number | null; photoCount: number;
  projectCode: string; projectName: string; loggedByName: string;
}

export function ProgressScreen({
  logs, projects, filtered, can,
}: {
  logs: Log[];
  projects: Array<{ id: string; name: string; code: string }>;
  /** Whether a search, project or date range is narrowing the list. */
  filtered: boolean;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    const res = await deleteProgressLogAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("Log deleted."); router.refresh(); }
  }

  // Group by date so the page reads as a diary.
  const byDate = new Map<string, Log[]>();
  for (const l of logs) {
    const key = l.logDate.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), l]);
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <Alert tone="info">
        Photo capture and GPS tagging happen on the mobile app. Logs written here carry the same
        fields, so the two are the same record.
      </Alert>

      <ListToolbar
        className="mb-0"
        searchPlaceholder="Search title, notes, weather or author…"
        filters={[
          {
            name: "project",
            label: "Project",
            allLabel: "All projects",
            options: projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          },
        ]}
        dateRange={{ label: "Log date" }}
        count={logs.length}
      >
        {can.export && (
          <ExportMenu
            href={(format) => exportHref("/api/projects/progress/export", format, params)}
            disabled={logs.length === 0}
          />
        )}
        {can.create && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Log today
          </Button>
        )}
      </ListToolbar>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Camera className="h-8 w-8" />}
            title={progressEmpty(filtered).title}
            description={
              filtered
                ? "Nothing matches this project, date range and search."
                : "A daily log is the visual record that survives to handover."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()].map(([date, dayLogs]) => (
            <div key={date}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-500">
                {formatDate(date)}
              </p>
              <div className="space-y-2">
                {dayLogs.map((l) => (
                  <Card key={l.id}>
                    <CardBody className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-navy-950">{l.title}</span>
                            <Badge tone="slate">{l.projectCode}</Badge>
                          </div>
                          {l.notes && <p className="mt-1 text-sm text-muted-600">{l.notes}</p>}
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-400">
                            <span>by {l.loggedByName}</span>
                            {l.manpowerCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />{l.manpowerCount} on site
                              </span>
                            )}
                            {l.weather && <span>{l.weather}</span>}
                            {l.latitude !== null && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {l.latitude.toFixed(5)}, {l.longitude?.toFixed(5)}
                              </span>
                            )}
                            {l.photoCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Camera className="h-3 w-3" />{l.photoCount} photo(s)
                              </span>
                            )}
                          </div>
                        </div>

                        {can.delete && (
                          <button type="button" disabled={busy === l.id} onClick={() => remove(l.id)}
                            className="shrink-0 rounded p-1.5 text-muted-400 hover:bg-bad-050 hover:text-bad-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <LogModal
          projects={projects}
          onClose={() => setCreating(false)}
          onDone={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function LogModal({
  projects, onClose, onDone,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [coords, setCoords] = React.useState<{ lat: string; lng: string } | null>(null);

  function capture() {
    if (!navigator.geolocation) {
      setError("This browser cannot provide a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: String(p.coords.latitude), lng: String(p.coords.longitude) }),
      () => setError("Location permission was refused."),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createProgressLogAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Site log recorded.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Log site progress"
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-form" loading={busy}>Save log</Button>
        </>
      }
    >
      <form id="log-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Project" required>
          <Select name="projectId" required defaultValue={projects[0]?.id ?? ""}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input name="logDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="What happened today" required>
          <Input name="title" required placeholder="Slab shuttering — 7th floor" />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" rows={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Workers on site">
            <Input name="manpowerCount" type="number" min={0} defaultValue={0} className="num text-right" />
          </Field>
          <Field label="Weather">
            <Input name="weather" placeholder="Clear / rain" />
          </Field>
        </div>

        <div>
          <Button type="button" variant="secondary" size="sm" onClick={capture}>
            <MapPin className="h-3.5 w-3.5" />
            {coords ? "Location captured" : "Capture location"}
          </Button>
          <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
          <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
          {coords && (
            <p className="mt-1 text-xs text-muted-500">
              {Number(coords.lat).toFixed(5)}, {Number(coords.lng).toFixed(5)}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
