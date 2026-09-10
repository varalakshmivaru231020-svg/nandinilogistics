"use client";

import * as React from "react";

/**
 * The design's toast: one message at a time, navy, bottom-centre, gone after
 * 2.6 seconds. It replaces the per-screen notice banners so a confirmation
 * reads the same wherever it comes from.
 */
const DISMISS_MS = 2600;

type Tone = "default" | "bad";
interface ToastState { id: number; message: string; tone: Tone }

const ToastContext = React.createContext<{
  toast: (message: string, tone?: Tone) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<ToastState | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = React.useRef(0);

  const toast = React.useCallback((message: string, tone: Tone = "default") => {
    nextId.current += 1;
    setCurrent({ id: nextId.current, message, tone });
  }, []);

  // One timer, restarted whenever a new message replaces the old one.
  React.useEffect(() => {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), DISMISS_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [current]);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport current={current} onDismiss={() => setCurrent(null)} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  current, onDismiss,
}: {
  current: ToastState | null;
  onDismiss: () => void;
}) {
  // No portal: the provider sits at the shell root and the toast is
  // position-fixed, so it paints over everything from where it is. That also
  // keeps it rendering identically on the server and the client.
  if (!current) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      key={current.id}
      className={[
        "animate-fade-up fixed bottom-[26px] left-1/2 z-[90] -translate-x-1/2 cursor-pointer",
        "flex items-center gap-2.5 rounded-[11px] px-5 py-3.5",
        "text-[13px] font-semibold text-white",
        "shadow-[0_14px_40px_rgba(25,26,92,.35)]",
        current.tone === "bad" ? "bg-bad-600" : "bg-navy-950",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold",
          current.tone === "bad" ? "bg-white/25 text-white" : "bg-brand-500 text-white",
        ].join(" ")}
      >
        {current.tone === "bad" ? "!" : "✓"}
      </span>
      {current.message}
    </div>
  );
}

/**
 * Returns a `toast(message)` function. Safe outside a provider — it falls back
 * to doing nothing rather than throwing, so a component can be rendered in
 * isolation (a test, a preview) without one.
 */
export function useToast() {
  const ctx = React.useContext(ToastContext);
  return ctx?.toast ?? (() => undefined);
}
