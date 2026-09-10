/**
 * The design's loading screen: an equaliser of five bars over the navy
 * gradient, the product name, and a line that fills. Used as the App Router
 * loading boundary, so it shows while a route segment is still fetching.
 */
const BARS = [
  { h: 30, color: "bg-brand-300", delay: "-0.9s" },
  { h: 44, color: "bg-brand-500", delay: "-0.6s" },
  { h: 64, color: "bg-white", delay: "-0.3s" },
  { h: 50, color: "bg-brand-500", delay: "0s" },
  { h: 36, color: "bg-brand-300", delay: "0.3s" },
];

export function LoadingSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[linear-gradient(160deg,#191A5C_0%,#23246E_55%,#2F308C_100%)]"
    >
      <div className="animate-ld-fade flex flex-col items-center gap-[26px]">
        <div className="flex h-16 items-end gap-[7px]">
          {BARS.map((b, i) => (
            <span
              key={i}
              className={`animate-ld-bar w-[13px] rounded-[3px] ${b.color}`}
              style={{ height: b.h, animationDelay: b.delay }}
            />
          ))}
        </div>

        <div className="text-center">
          <p className="font-display text-[22px] font-bold tracking-[.02em] text-white">NN Infra ERP</p>
          <p className="mt-2 text-[12px] font-medium uppercase tracking-[.22em] text-[#9AA0D6]">
            Construction &amp; Real Estate Console
          </p>
        </div>

        <div className="h-[3px] w-[220px] overflow-hidden rounded-full bg-white/15">
          <div className="animate-ld-line h-full rounded-full bg-[linear-gradient(90deg,#0089C9,#5BC8F2)]" />
        </div>
      </div>
    </div>
  );
}
