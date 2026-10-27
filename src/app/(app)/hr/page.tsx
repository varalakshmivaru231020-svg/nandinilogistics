import { redirect } from "next/navigation";

/** The old combined list; the sidebar now has Riders, Internal Staff and Attendance. */
export default async function HrIndex({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) q.set(k, v);
  const tab = raw.tab;
  const target = tab === "mark" || tab === "report" ? "/hr/attendance" : "/hr/riders";
  redirect(q.size ? `${target}?${q.toString()}` : target);
}
