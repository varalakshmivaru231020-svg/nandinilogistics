/**
 * The follow-up list's own words: the channel chips, the design's buckets and
 * the line it writes for when one is due.
 *
 * Client-safe: `follow-ups-screen.tsx` runs in the browser, the phone's row is
 * built on the server, and both read these.
 */

/** How a tele-caller reaches a prospective rider, per the SOW. */
export const CHANNELS = ["CALL", "WHATSAPP", "MEETING"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_ICON: Record<string, string> = {
  CALL: "📞", WHATSAPP: "💬", MEETING: "🤝",
};

export const CHANNEL_LABEL: Record<string, string> = {
  CALL: "Call", WHATSAPP: "WhatsApp", MEETING: "Meeting",
};

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

const DAY = 86_400_000;

/** The design's buckets, oldest pressure first. */
export type BucketKey = "overdue" | "today" | "tomorrow" | "week" | "later";

export const BUCKETS: Array<{ key: BucketKey; name: string; tone: string }> = [
  { key: "overdue", name: "Overdue", tone: "text-bad-700" },
  { key: "today", name: "Today", tone: "text-warn-700" },
  { key: "tomorrow", name: "Tomorrow", tone: "text-brand-700" },
  { key: "week", name: "This Week", tone: "text-plum-700" },
  { key: "later", name: "Later", tone: "text-slate-600" },
];

export function bucketOf(dueAt: string | Date, nowMs: number): BucketKey {
  const now = new Date(nowMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(dueAt).getTime();
  if (due < startToday) return "overdue";
  if (due < startToday + DAY) return "today";
  if (due < startToday + 2 * DAY) return "tomorrow";
  if (due < startToday + 7 * DAY) return "week";
  return "later";
}

/** The design writes "01/09/2026, 16:30" and one word beside it. */
export function whenLabel(dueAt: string | Date, nowMs: number) {
  const bucket = bucketOf(dueAt, nowMs);
  const text = new Date(dueAt).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  if (bucket === "overdue") return { text, badge: "OVERDUE", pill: "bg-bad-700", tone: "text-bad-700" };
  if (bucket === "today") return { text, badge: "TODAY", pill: "bg-warn-700", tone: "text-warn-700" };
  return { text, badge: "UPCOMING", pill: "bg-brand-700", tone: "text-brand-700" };
}

/** The badge word, in the tones the phone draws. */
export const BUCKET_TONE: Record<BucketKey, "bad" | "warn" | "brand" | "violet" | "muted"> = {
  overdue: "bad", today: "warn", tomorrow: "brand", week: "violet", later: "muted",
};

/** The table's own line when nothing is scheduled. */
export const FOLLOW_UP_EMPTY = { title: "Nothing scheduled." };
