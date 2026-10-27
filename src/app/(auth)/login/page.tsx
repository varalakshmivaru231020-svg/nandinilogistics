import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/rbac/context";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel, in the design's navy gradient */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle,#0089C9,transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <div className="grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-white/10 ring-1 ring-white/20">
            <span className="font-display text-[16px] font-extrabold tracking-[-.02em] text-brand-300">
              NL
            </span>
          </div>
          <div>
            <p className="font-display text-[15px] font-bold leading-tight">Nandini Logistics</p>
            <p className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[.14em] text-brand-300">
              Rider CRM &amp; Payouts
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-[30px] font-extrabold leading-[1.25] tracking-[-.02em]">
            One platform for rider hiring, onboarding, attendance and weekly payouts.
          </h1>
          <p className="mt-4 text-[13.5px] font-medium leading-relaxed text-white/70">
            A single database and a single permission model, so the site and the office are never
            working from different numbers — from the first call to the weekly payout.
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5">
            {[
              ["Leads", "Tele-calling, follow-ups and approvals"],
              ["Onboarding", "KYC, Rider ID, ID card and offer letter"],
              ["Payouts", "Excel import, advances, bike rent and holds"],
              ["Control", "Role-based access and a full audit trail"],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="text-[12.5px] font-bold text-brand-300">{title}</dt>
                <dd className="mt-1 text-[11.5px] font-medium leading-relaxed text-white/60">{body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-[10.5px] font-medium tracking-wide text-white/45">
          Encrypted transport · hashed credentials · role-based access control · full audit trail
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-surface-page px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-9 lg:hidden">
            <div
              className="mb-3 grid h-[42px] w-[42px] place-items-center rounded-[11px]"
              style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
            >
              <span className="font-display text-[16px] font-extrabold text-brand-300">NL</span>
            </div>
            <p className="font-display text-[15px] font-bold text-navy-950">
              Nandini Logistics
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-500">
              Rider CRM &amp; Payouts
            </p>
          </div>

          <div className="rounded-[14px] border border-line-400 bg-white p-7 shadow-[0_16px_40px_rgba(25,26,92,.06)]">
            <h2 className="font-display text-[20px] font-extrabold tracking-[-.02em] text-navy-950">
              Sign in
            </h2>
            <p className="mt-1.5 text-[12.5px] font-medium text-muted-600">
              Use your work email address to continue.
            </p>

            <LoginForm next={next} />
          </div>

          <p className="mt-6 text-center text-[11px] font-medium text-muted-400">
            Each role signs in to a different console — the menu you see is your permission set.
          </p>
        </div>
      </div>
    </div>
  );
}
