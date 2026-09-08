import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-brand-800 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-white/10 ring-1 ring-white/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">NN Infrastructure Developers</p>
            <p className="text-xs text-brand-200">ERP &amp; Sales CRM Platform</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-2xl font-semibold leading-snug">
            One platform for project execution, site quality, material procurement and residential sales.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-200">
            A single database and a single permission model, so the site and the office are never
            working from different numbers.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ["Projects", "Work breakdown, schedule, site progress"],
              ["Material", "Indent to payment, fully approved"],
              ["Sales", "Enquiry to booking on live availability"],
              ["Control", "Role-based access and full audit trail"],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="font-medium text-white">{title}</dt>
                <dd className="mt-0.5 text-xs text-brand-200">{body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-brand-300">
          Encrypted transport · hashed credentials · role-based access control · full audit trail
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-md bg-brand-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900">NN Infrastructure Developers</p>
            <p className="text-xs text-slate-500">ERP &amp; Sales CRM Platform</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your work email address to continue.</p>

          <LoginForm next={next} />

          <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700">Demo accounts</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              owner@ · pm@ · supervisor@ · store@ · saleshead@ · sales@
              <span className="text-slate-400"> nninfra.example</span>
              <br />
              Password for all: <code className="rounded bg-white px-1 py-0.5 text-slate-700 ring-1 ring-slate-200">Nninfra@2026</code>
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Each one lands on a different dashboard with a different menu — that is the permission
              model doing its job.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
