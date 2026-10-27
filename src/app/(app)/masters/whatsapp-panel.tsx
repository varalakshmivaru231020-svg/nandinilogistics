"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Field, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { WhatsappConsole } from "@/lib/whatsapp/console";

import {
  importWhatsappTemplatesAction,
  resendWhatsappMessageAction,
  saveWhatsappConnectionAction,
  saveWhatsappTriggerAction,
  testWhatsappConnectionAction,
} from "./whatsapp-actions";

/**
 * WhatsApp, on Masters & Users: the connection, the triggers, and the log.
 *
 * Three questions an administrator actually has, in the order they have them —
 * is it connected, what does it send, and did the last one go out. Everything
 * on this screen is a row in the database; nothing is an environment variable,
 * because a token in an environment variable needs a deploy to change and this
 * one does not.
 */

type Console = WhatsappConsole;

export function WhatsAppPanel({
  console: data,
  canUpdate,
  canSend,
}: {
  console: Console;
  canUpdate: boolean;
  canSend: boolean;
}) {
  const [tab, setTab] = React.useState<"connection" | "triggers" | "log">("connection");

  const TABS = [
    { key: "connection" as const, label: "Connection" },
    { key: "triggers" as const, label: `Triggers · ${data.rows.filter((r) => r.enabled).length} on` },
    { key: "log" as const, label: `Messages${data.waiting ? ` · ${data.waiting} waiting` : ""}` },
  ];

  return (
    <div>
      <div className="mb-3.5 flex gap-5 border-b border-line-400">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "cursor-pointer border-b-[2.5px] px-1 py-2.5 text-[13px]",
              tab === t.key
                ? "border-brand-500 font-bold text-brand-700"
                : "border-transparent font-semibold text-muted-500 hover:text-navy-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "connection" && (
        <Connection settings={data.settings} canUpdate={canUpdate} canSend={canSend} />
      )}
      {tab === "triggers" && (
        <Triggers
          rows={data.rows}
          templates={data.templates}
          canUpdate={canUpdate}
          connected={data.settings.enabled}
        />
      )}
      {tab === "log" && <Log recent={data.recent} canSend={canSend} />}
    </div>
  );
}

/* ----------------------------------------------------------- connection */

function Connection({
  settings,
  canUpdate,
  canSend,
}: {
  settings: Console["settings"];
  canUpdate: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveWhatsappConnectionAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotice("Saved. The next message uses it — nothing needs restarting.");
      router.refresh();
    }
  }

  async function test() {
    setTesting(true);
    setError(null);
    setNotice(null);
    const res = await testWhatsappConnectionAction();
    setTesting(false);
    if (!res.ok) setError(res.error);
    else setNotice(`Reached ${res.data.displayPhone || res.data.phoneNumberId}.`);
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await importWhatsappTemplatesAction();
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotice(
        `Read ${res.data.found} template(s) back — ${res.data.added} new, ${res.data.updated} updated.`,
      );
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-3.5">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="rounded-[12px] border border-line-400 bg-surface-tint px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
            disabled={!canUpdate}
            className="h-4 w-4"
          />
          <span className="text-[13px] font-bold text-navy-900">Send WhatsApp messages</span>
        </label>
        <p className="mt-1 text-[11.5px] font-medium text-muted-500">
          Off, nothing is sent and nothing is queued. The triggers keep their settings.
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="API url" hint="Meta direct, or your provider's own base url.">
          <Input name="apiUrl" defaultValue={settings.apiUrl} disabled={!canUpdate} />
        </Field>
        <Field label="Version">
          <Input name="apiVersion" defaultValue={settings.apiVersion} disabled={!canUpdate} />
        </Field>
        <Field label="Phone number id" hint="The id of the sending number, not the number.">
          <Input name="phoneNumberId" defaultValue={settings.phoneNumberId} disabled={!canUpdate} />
        </Field>
        <Field label="Sending number" hint="As a person would read it. Shown here only.">
          <Input name="displayPhone" defaultValue={settings.displayPhone} disabled={!canUpdate} />
        </Field>
        <Field
          label="WhatsApp Business Account id"
          hint="Only needed to read approved templates back from Meta."
          className="sm:col-span-2"
        >
          <Input name="wabaId" defaultValue={settings.wabaId} disabled={!canUpdate} />
        </Field>
        <Field
          label="Access token"
          hint={
            settings.tokenSet
              ? `One is set (${settings.tokenHint}). Leave this empty to keep it.`
              : "No token is set yet."
          }
          className="sm:col-span-2"
        >
          <Input
            name="accessToken"
            type="password"
            autoComplete="off"
            placeholder={settings.tokenSet ? "••••••••  (unchanged)" : "Paste the token"}
            disabled={!canUpdate}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {canUpdate && (
          <Button type="submit" loading={busy}>
            Save connection
          </Button>
        )}
        {canSend && (
          <Button type="button" variant="outline" loading={testing} onClick={test}>
            Test connection
          </Button>
        )}
        {canUpdate && (
          <Button type="button" variant="outline" loading={busy} onClick={sync}>
            Read templates from Meta
          </Button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- triggers */

function Triggers({
  rows,
  templates,
  canUpdate,
  connected,
}: {
  rows: Console["rows"];
  templates: Console["templates"];
  canUpdate: boolean;
  connected: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save(
    event: string,
    input: { templateId: string | null; enabled: boolean; delayMinutes: number | null; fallbackPhone: string | null },
  ) {
    setSaving(event);
    setError(null);
    const res = await saveWhatsappTriggerAction(event, input);
    setSaving(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const modules = [...new Set(rows.map((r) => r.event.module))];

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {!connected && (
        <Alert tone="warn">
          WhatsApp is switched off on the Connection tab. These settings are kept, and nothing is
          sent until it is on.
        </Alert>
      )}

      {modules.map((module) => (
        <div key={module}>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            {module}
          </div>
          <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
            {rows
              .filter((r) => r.event.module === module)
              .map((row, i) => (
                <div
                  key={row.event.key}
                  className={cn(
                    "px-4 py-3.5",
                    i > 0 && "border-t border-line-150",
                    row.enabled && "bg-good-025",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-navy-900">
                          {row.event.label}
                        </span>
                        <Badge tone={row.event.audience === "staff" ? "slate" : "warn"}>
                          {row.event.audience === "staff" ? "staff" : row.event.audience}
                        </Badge>
                        {row.enabled ? (
                          <Badge tone="good">on</Badge>
                        ) : (
                          <Badge tone="muted">off</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] font-medium text-muted-500">
                        {row.event.fires}. Goes to {row.event.recipient.toLowerCase()}.
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-muted-400">
                        Template <code className="font-mono">{row.event.template}</code> ·{" "}
                        {row.event.variables.length} variables
                        {row.sent > 0 && ` · ${row.sent} sent`}
                        {row.failed > 0 && ` · ${row.failed} not sent`}
                        {row.queued > 0 && ` · ${row.queued} waiting`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Template" className="w-[230px]">
                        <Select
                          defaultValue={row.templateId ?? ""}
                          disabled={!canUpdate || saving === row.event.key}
                          onChange={(e) =>
                            save(row.event.key, {
                              templateId: e.target.value || null,
                              enabled: row.enabled,
                              delayMinutes: row.delayMinutes,
                              fallbackPhone: row.fallbackPhone,
                            })
                          }
                        >
                          <option value="">Not mapped</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} · {t.languageCode} · {t.status.toLowerCase()}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Delay (min)" className="w-[96px]">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={row.delayMinutes ?? 0}
                          disabled={!canUpdate || saving === row.event.key}
                          onBlur={(e) =>
                            save(row.event.key, {
                              templateId: row.templateId,
                              enabled: row.enabled,
                              delayMinutes: Number(e.target.value) || null,
                              fallbackPhone: row.fallbackPhone,
                            })
                          }
                        />
                      </Field>
                      {canUpdate && (
                        <Button
                          size="sm"
                          variant={row.enabled ? "outline" : "primary"}
                          loading={saving === row.event.key}
                          onClick={() =>
                            save(row.event.key, {
                              templateId: row.templateId,
                              enabled: !row.enabled,
                              delayMinutes: row.delayMinutes,
                              fallbackPhone: row.fallbackPhone,
                            })
                          }
                        >
                          {row.enabled ? "Switch off" : "Switch on"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ log */

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "slate"> = {
  SENT: "good",
  QUEUED: "slate",
  SCHEDULED: "slate",
  FAILED: "bad",
  SKIPPED: "warn",
};

function Log({ recent, canSend }: { recent: Console["recent"]; canSend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function resend(id: string) {
    setBusy(id);
    setError(null);
    const res = await resendWhatsappMessageAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  if (recent.length === 0) {
    return (
      <p className="rounded-[13px] border border-dashed border-line-400 px-4 py-8 text-center text-[12.5px] font-medium text-muted-400">
        Nothing has been queued yet. A message appears here the moment an event fires, whether or
        not it could be sent.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
        {recent.map((m, i) => (
          <div
            key={m.id}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5",
              i > 0 && "border-t border-line-150",
            )}
          >
            <Badge tone={STATUS_TONE[m.status] ?? "slate"}>{m.status.toLowerCase()}</Badge>
            <span className="num w-[120px] shrink-0 text-[12px] font-semibold text-navy-900">
              {m.toPhone || "no number"}
            </span>
            <span className="min-w-[180px] flex-1 truncate text-[12px] font-medium text-muted-600">
              <code className="font-mono text-[11.5px]">{m.templateName}</code> · {m.event}
            </span>
            <span className="num shrink-0 text-[11px] font-medium text-muted-400">
              {new Date(m.sentAt ?? m.createdAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {m.attempts > 1 && ` · ${m.attempts} tries`}
            </span>
            {m.error && (
              <span className="w-full truncate text-[11px] font-medium text-bad-600" title={m.error}>
                {m.error}
              </span>
            )}
            {canSend && m.status !== "SENT" && (
              <Button size="xs" variant="outline" loading={busy === m.id} onClick={() => resend(m.id)}>
                Send again
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
