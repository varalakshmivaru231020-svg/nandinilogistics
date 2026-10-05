import Link from "next/link";

import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "plain";

export interface ModuleCard {
  key: string;
  title: string;
  href: string;
  /** The one figure that answers "is this module healthy?". */
  headline: string;
  headlineLabel: string;
  tone: Tone;
  rows: Array<{ label: string; value: string; tone?: Tone }>;
}

interface Person {
  id: string; name: string; total: number; onTime: number; late: number;
  stillOverdue: number; averageDelayDays: number;
  controllableExtensions: number; uncontrollableExtensions: number; score: number | null;
}

const HEADLINE: Record<Tone, string> = {
  good: "border-good-400 bg-good-050",
  warn: "border-warn-400 bg-warn-050",
  bad: "border-bad-300 bg-bad-025",
  plain: "border-line-400 bg-white",
};

const VALUE: Record<Tone, string> = {
  good: "text-good-700",
  warn: "text-warn-800",
  bad: "text-bad-700",
  plain: "text-navy-900",
};

/**
 * One screen for the whole system.
 *
 * Each module gets a card with the single figure that answers whether it is
 * healthy, and the handful of numbers behind that figure. Underneath sits the
 * performance matrix, which is the one table that compares people rather than
 * modules.
 */
export function PerformanceDashboard({
  cards, people, seesEveryone,
}: {
  cards: ModuleCard[];
  people: Person[];
  seesEveryone: boolean;
}) {
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Performance"
        description="Every module's health on one screen, and how each person is doing against the dates they were given."
      />

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to show you"
            description="You do not have access to any module this dashboard reports on."
          />
        </Card>
      ) : (
        <div className="mb-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className={cn(
                "rounded-[13px] border px-5 py-4 transition-colors hover:border-brand-500",
                HEADLINE[c.tone],
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[13px] font-bold text-navy-950">{c.title}</span>
                <span className="text-[10.5px] font-semibold text-muted-400">open →</span>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className={cn("num font-display text-[28px] font-extrabold", VALUE[c.tone])}>
                  {c.headline}
                </span>
                <span className="text-[11.5px] font-medium text-muted-500">{c.headlineLabel}</span>
              </div>

              <dl className="mt-3 space-y-1.5 border-t border-line-200 pt-3">
                {c.rows.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11.5px] font-medium text-muted-600">{r.label}</dt>
                    <dd className={cn("num text-[12.5px] font-bold", VALUE[r.tone ?? "plain"])}>
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line-300 bg-surface-sunken px-5 py-4">
          <h2 className="font-display text-[14px] font-bold text-navy-950">
            {seesEveryone ? "Performance matrix" : "Your performance"}
          </h2>
          <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">
            A task is on time if it was finished on or before its effective due date — the original
            date plus only the time granted for delays outside the assignee&rsquo;s control. Every task
            counts the same whatever its priority.
          </p>
        </div>

        {people.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] font-medium text-muted-400">
            Nobody has been given a task yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  {["Person", "Tasks", "On time", "Late", "Still overdue", "Avg delay", "Controllable", "Uncontrollable", "Score"]
                    .map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          "border-b border-line-150 bg-surface-sunken px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400",
                          i === 0 ? "text-left" : "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-tint">
                    <td className="border-b border-line-100 px-4 py-[11px] text-[12.5px] font-semibold text-navy-900">
                      {p.name}
                    </td>
                    <Num>{p.total}</Num>
                    <Num tone="good">{p.onTime}</Num>
                    <Num tone={p.late ? "bad" : "plain"}>{p.late}</Num>
                    <Num tone={p.stillOverdue ? "warn" : "plain"}>{p.stillOverdue}</Num>
                    <Num>{p.late ? `${p.averageDelayDays} d` : "—"}</Num>
                    <Num tone={p.controllableExtensions ? "warn" : "plain"}>{p.controllableExtensions}</Num>
                    <Num>{p.uncontrollableExtensions}</Num>
                    <td className="border-b border-line-100 px-4 py-[11px] text-right">
                      <span className={cn(
                        "num rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                        p.score === null ? "bg-surface-field text-muted-500"
                          : p.score >= 85 ? "bg-good-050 text-good-700"
                            : p.score >= 70 ? "bg-warn-050 text-warn-800"
                              : "bg-bad-050 text-bad-700",
                      )}>
                        {p.score === null ? "—" : `${p.score}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Num({ children, tone = "plain" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <td className={cn("num border-b border-line-100 px-4 py-[11px] text-right text-[12.5px] font-semibold", VALUE[tone])}>
      {children}
    </td>
  );
}
