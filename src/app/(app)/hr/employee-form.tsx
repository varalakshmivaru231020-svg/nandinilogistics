"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "@/components/shell/detail-screen";
import { SearchSelect } from "@/components/ui/search-select";
import { MobileInput } from "@/components/ui/mobile-input";
import { useToast } from "@/components/ui/toast";
import { COUNTRY_CODES } from "@/lib/forms/dial-codes";
import { uploadProblem } from "@/lib/upload-rules";
import { cn } from "@/lib/utils";
import { isInternalStaffType, isRiderType, RIDER_DOC_KINDS, type OnboardingStatus } from "@/lib/riders/onboarding";
import { createEmployeeAction, updateEmployeeAction } from "./actions";

export interface Employee {
  id: string; code: string; name: string; mobile: string; altContact: string | null;
  aadhaar: string | null; pan: string | null; address: string | null;
  temporaryStreet: string | null; temporaryCity: string | null; temporaryState: string | null; temporaryPinCode: string | null;
  permanentStreet: string | null; permanentCity: string | null; permanentState: string | null; permanentPinCode: string | null;
  employmentTypeId: string; employmentType: string;
  designationId: string | null; designation: string | null;
  status: string;
  onboardingStatus: OnboardingStatus;
  /** A new record waits for a Team Leader or Super Admin. */
  approval: "APPROVED" | "PENDING" | "REJECTED";
  emergencyMobileFamily: string | null; emergencyMobileFriend: string | null;
  bankAccountNo: string | null; bankHolderName: string | null; bankIfsc: string | null; bankName: string | null;
  pfNumber: string | null; drivingLicence: string | null; insuranceNumber: string | null;
  monthlySalary: number | null; joinedOn: string | null;
  companyIds: string[]; companies: string[];
  /** Whether a photograph is on file, so the row and the form can show it. */
  hasPhoto: boolean;
  referredById?: string | null;
  referralApproval?: string;
  documents: Array<{ id: string; kind: string; fileName: string; fileSize: number }>;
}

/** Someone who can be picked as "Referred by" — an active, accepted rider. */
export interface Referrer { id: string; name: string; code: string; referralCode: string | null }

/** The design writes an attached file's weight in kilobytes: "740 KB". */
export function fileSize(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The employee form — one page for a new rider or staff member and for an
 * edit. The sections follow the record: who they are, how to reach them, the
 * two addresses side by side, their employment, then what a rider also needs
 * (emergency contacts, bank, companies) and the KYC copies.
 */
export function EmployeeForm({
  employee, employmentTypes, defaultTypeId = null, referrers = [], designations, companies, canManageCompanies,
  backHref, afterSaveHref,
}: {
  employee: Employee | null;
  employmentTypes: Array<{ id: string; name: string }>;
  defaultTypeId?: string | null;
  referrers?: Referrer[];
  designations: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  canManageCompanies: boolean;
  /** Where Back and Cancel go. */
  backHref: string;
  /** Where a saved record goes — the list, or the record itself. */
  afterSaveHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  // Which particulars the form asks for follows the employment type picked:
  // a rider has emergency numbers, a bank account and companies; internal
  // staff a monthly salary.
  const [pickedTypeId, setTypeId] = React.useState(employee?.employmentTypeId ?? defaultTypeId ?? employmentTypes[0]?.id ?? "");
  const typeId = employmentTypes.some((t) => t.id === pickedTypeId) ? pickedTypeId : (employmentTypes[0]?.id ?? "");
  const typeName = employmentTypes.find((t) => t.id === typeId)?.name ?? "";
  const rider = isRiderType(typeName);
  const internal = isInternalStaffType(typeName);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = React.useState<string[]>(employee?.companyIds ?? []);
  const [photoName, setPhotoName] = React.useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [docs, setDocs] = React.useState<Record<string, { name: string; size: string } | null>>({});
  const docInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    // The design asks for the country code beside the number; the record keeps
    // the two together.
    const dial = String(fd.get("mobileCode") ?? "").split(" ")[0];
    const typed = String(fd.get("mobile") ?? "").trim();
    if (dial && typed && !typed.startsWith("+")) fd.set("mobile", `${dial} ${typed}`);
    fd.delete("mobileCode");
    const res = employee
      ? await updateEmployeeAction(employee.id, fd)
      : await createEmployeeAction(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const held = res.data?.pending;
    toast(employee
      ? (held ? `Changes to ${fd.get("name")} sent for approval` : `${fd.get("name")} updated`)
      : (held ? `${fd.get("name")} added — waiting for Team Leader / Super Admin approval` : `${fd.get("name")} added to the user master`));
    router.push(afterSaveHref);
    router.refresh();
  }

  const submitLabel = employee ? "Save changes" : "Create employee";

  return (
    <DetailScreen
      backHref={backHref}
      title={employee ? "Edit employee" : "New employee"}
      subtitle={employee ? `${employee.code} · ${employee.name}` : "Add employee details and complete registration. Name, mobile, photo and Aadhaar are mandatory."}
      actions={<Button type="submit" form="employee-form" loading={busy}>{submitLabel}</Button>}
    >
      <form id="employee-form" onSubmit={submit} className="mx-auto max-w-[1180px] space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {/* ------------------------------------------------ A. Basic information */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Basic information</CardTitle>
              <CardSubtitle>Who they are and what they do.</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody className="flex flex-wrap items-start gap-5">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <label
                className={cn(
                  "relative flex h-[132px] w-[132px] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[16px] border-[1.5px] text-center text-[11px] font-semibold transition-colors",
                  photoName
                    ? "border-solid border-good-400 bg-good-050 text-good-700"
                    : "border-dashed border-muted-200 bg-surface-sunken text-muted-400 hover:border-brand-500 hover:text-brand-700",
                )}
              >
                {photoPreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Photo to upload" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-navy-950/60 py-1 text-[10px] font-bold text-white">Change</span>
                  </>
                ) : employee?.hasPhoto ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/hr/photo/${employee.id}`} alt={employee.name} className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-navy-950/60 py-1 text-[10px] font-bold text-white">Change</span>
                  </>
                ) : (
                  <>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[20px] shadow-sm">📷</span>
                    <span className="px-2">{photoName ? "✓ Photo added" : "Upload photo"}</span>
                    <span className="px-2 text-[9.5px] font-medium">JPG or PNG</span>
                  </>
                )}
                <input
                  type="file"
                  name="photo"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    const problem = f ? uploadProblem([f]) : null;
                    if (photoPreview) URL.revokeObjectURL(photoPreview);
                    if (problem) { setError(problem); e.target.value = ""; setPhotoName(null); setPhotoPreview(null); return; }
                    setError(null);
                    setPhotoName(f?.name ?? null);
                    setPhotoPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
              </label>
              <span className="text-[10.5px] font-semibold text-muted-500">
                Photo <span className="text-bad-600">*</span>
              </span>
            </div>

            <div className="grid min-w-[260px] flex-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Type of employment" required>
                {employmentTypes.length === 1 ? (
                  <>
                    <input type="hidden" name="employmentTypeId" value={typeId} />
                    <div className="flex h-[44px] items-center rounded-[10px] border border-line-400 bg-surface-sunken px-3.5 text-[13.5px] font-semibold text-navy-900">
                      {employmentTypes[0].name}
                    </div>
                  </>
                ) : (
                  <Select name="employmentTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className="font-semibold" required>
                    {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Name" required>
                <Input name="name" defaultValue={employee?.name} placeholder="Full name" required autoFocus />
              </Field>
              <Field label="Designation">
                <Select name="designationId" defaultValue={employee?.designationId ?? ""} className="font-semibold">
                  <option value="">Select designation…</option>
                  {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
            </div>
          </CardBody>
        </Card>

        {/* ---------------------------------------- B. Contact & identity details */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contact &amp; identity details</CardTitle>
              <CardSubtitle>A 10-digit mobile number and the Aadhaar number are mandatory.</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Mobile number" required>
              <div className="flex gap-2">
                <Select
                  name="mobileCode"
                  defaultValue="+91 India"
                  aria-label="Country code"
                  className="w-[118px] shrink-0 px-2 text-[12px]"
                >
                  {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <MobileInput name="mobile" defaultValue={employee?.mobile} placeholder="98765 43210" required />
              </div>
            </Field>
            <Field label="Aadhaar number" required>
              <Input name="aadhaar" defaultValue={employee?.aadhaar ?? ""} placeholder="1234 5678 9012" required />
            </Field>
            <Field label="PAN">
              <Input name="pan" defaultValue={employee?.pan ?? ""} placeholder="ABCDE1234F" className="uppercase" />
            </Field>
            <Field label="Alternate number">
              <MobileInput name="altContact" defaultValue={employee?.altContact ?? ""} placeholder="+91 90000 00000" />
            </Field>
          </CardBody>
        </Card>

        {/* -------------------------------------------- C + D. The two addresses */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Current Address</CardTitle>
                <CardSubtitle>Professional address — where they stay while on duty.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Street" className="sm:col-span-2"><Input name="temporaryStreet" defaultValue={employee?.temporaryStreet ?? ""} placeholder="House, street, area" /></Field>
              <Field label="City"><Input name="temporaryCity" defaultValue={employee?.temporaryCity ?? ""} placeholder="City" /></Field>
              <Field label="State"><Input name="temporaryState" defaultValue={employee?.temporaryState ?? ""} placeholder="State" /></Field>
              <Field label="PIN code"><Input name="temporaryPinCode" inputMode="numeric" pattern="[0-9]{6}" title="A 6-digit PIN code" defaultValue={employee?.temporaryPinCode ?? ""} placeholder="600001" maxLength={6} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Native Address</CardTitle>
                <CardSubtitle>Personal address — their permanent home.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Street" className="sm:col-span-2"><Input name="permanentStreet" defaultValue={employee?.permanentStreet ?? ""} placeholder="House, street, area" /></Field>
              <Field label="City"><Input name="permanentCity" defaultValue={employee?.permanentCity ?? ""} placeholder="City" /></Field>
              <Field label="State"><Input name="permanentState" defaultValue={employee?.permanentState ?? ""} placeholder="State" /></Field>
              <Field label="PIN code"><Input name="permanentPinCode" inputMode="numeric" pattern="[0-9]{6}" title="A 6-digit PIN code" defaultValue={employee?.permanentPinCode ?? ""} placeholder="600001" maxLength={6} /></Field>
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------------------------- Employment details */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Employment details</CardTitle>
              <CardSubtitle>{internal ? "Joining date and the salary the payslip starts from." : "Joining date, licence and statutory numbers."}</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Joining date">
              <Input name="joinedOn" type="date" defaultValue={employee?.joinedOn ?? ""} />
            </Field>
            <Field label="Driving licence">
              <Input name="drivingLicence" defaultValue={employee?.drivingLicence ?? ""} placeholder="KA01 20230001234" className="uppercase" />
            </Field>
            <Field label="PF number">
              <Input name="pfNumber" defaultValue={employee?.pfNumber ?? ""} placeholder="Optional" />
            </Field>
            <Field label="Insurance number">
              <Input name="insuranceNumber" defaultValue={employee?.insuranceNumber ?? ""} placeholder="Shown on the ID card" />
            </Field>
            {internal && (
              <Field label="Monthly salary (₹)">
                <Input name="monthlySalary" type="number" min={0} step="1" defaultValue={employee?.monthlySalary ?? ""} placeholder="e.g. 18000" />
              </Field>
            )}
            {rider && (
              <Field label="Referred by" hint="Optional — search a rider by name or Rider ID, or type their referral code" className="md:col-span-2">
                <Input
                  name="referredById"
                  list="referrer-options"
                  defaultValue={
                    employee?.referredById
                      ? (referrers.find((r) => r.id === employee.referredById)?.code ?? employee.referredById)
                      : ""
                  }
                  placeholder="e.g. NL004 or REF-NL004"
                  autoComplete="off"
                />
                <datalist id="referrer-options">
                  {referrers.filter((r) => r.id !== employee?.id).map((r) => (
                    <option key={r.id} value={r.code}>{`${r.name}${r.referralCode ? ` · ${r.referralCode}` : ""}`}</option>
                  ))}
                </datalist>
                {employee?.referralApproval === "PENDING" && (
                  <p className="mt-1 text-[11px] font-semibold text-warn-700">Referral pending approval</p>
                )}
              </Field>
            )}
          </CardBody>
        </Card>

        {rider && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Emergency contacts</CardTitle>
                    <CardSubtitle>Mandatory for riders.</CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="Father / mother mobile" required>
                    <MobileInput name="emergencyMobileFamily" defaultValue={employee?.emergencyMobileFamily ?? ""} placeholder="98765 43210" />
                  </Field>
                  <Field label="Friend mobile" required>
                    <MobileInput name="emergencyMobileFriend" defaultValue={employee?.emergencyMobileFriend ?? ""} placeholder="98765 43210" />
                  </Field>
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Bank details</CardTitle>
                    <CardSubtitle>Mandatory for riders — payouts are credited here.</CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="Account number" required>
                    <Input name="bankAccountNo" defaultValue={employee?.bankAccountNo ?? ""} placeholder="Account number" />
                  </Field>
                  <Field label="Account holder name" required>
                    <Input name="bankHolderName" defaultValue={employee?.bankHolderName ?? ""} placeholder="As on the passbook" />
                  </Field>
                  <Field label="IFSC code" required>
                    <Input name="bankIfsc" defaultValue={employee?.bankIfsc ?? ""} placeholder="HDFC0001234" className="uppercase" />
                  </Field>
                  <Field label="Bank name" required>
                    <Input name="bankName" defaultValue={employee?.bankName ?? ""} placeholder="Bank" />
                  </Field>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Deployment</CardTitle>
                  <CardSubtitle>The client companies this rider works for.</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <Field label="Companies deployed to" required>
                  {selectedCompanyIds.map((id) => <input key={id} type="hidden" name="companyIds" value={id} />)}
                  {Boolean(employee) && !canManageCompanies ? (
                    <p className="rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12.5px] font-medium text-muted-400">
                      Companies are changed by Admin.
                    </p>
                  ) : (
                    <SearchSelect
                      id="companyIds-picker"
                      value=""
                      placeholder={selectedCompanyIds.length ? "Add another company…" : "Search and pick a company…"}
                      emptyLabel="No company by that name"
                      options={companies
                        .filter((c) => !selectedCompanyIds.includes(c.id))
                        .map((c) => ({ id: c.id, label: c.name }))}
                      onChange={(id) => {
                        if (id && !selectedCompanyIds.includes(id)) setSelectedCompanyIds((current) => [...current, id]);
                      }}
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCompanyIds.map((id) => {
                      const company = companies.find((c) => c.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedCompanyIds((current) => current.filter((value) => value !== id))}
                          className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-700"
                          disabled={Boolean(employee) && !canManageCompanies}
                        >
                          {company?.name ?? id} ×
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-muted-400">Type to search. Pick one or more active companies; tap a chip to remove it.</p>
                </Field>
              </CardBody>
            </Card>
          </>
        )}

        {/* ------------------------------------------------------- Attachments */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Attachments <span className="font-medium text-muted-400">· optional</span></CardTitle>
              <CardSubtitle>Aadhaar front and back are mandatory for riders · PAN, passbook and driving licence optional</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody className="grid gap-2 md:grid-cols-2">
            {RIDER_DOC_KINDS.map((kind) => {
              // What this row shows: the file just picked, or failing that the
              // copy already on the record.
              const onFile = employee?.documents.find((d) => d.kind === kind);
              const doc = docs[kind] ?? (onFile ? { name: onFile.fileName, size: fileSize(onFile.fileSize) } : null);
              return (
                <div
                  key={kind}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border px-3 py-[11px]",
                    doc ? "border-solid border-line-300 bg-surface-tint" : "border-dashed border-muted-200 bg-surface-sunken",
                  )}
                >
                  <span className={cn("shrink-0 rounded-[5px] px-1.5 py-1 text-[8.5px] font-extrabold tracking-[.05em] text-white", doc ? "bg-bad-700" : "bg-muted-250")}>
                    PDF
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-navy-900">{kind}</span>
                    {doc && (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-400">
                        {doc.name} · {doc.size}
                      </span>
                    )}
                  </span>
                  {/* The input stays mounted whether or not a file has been chosen:
                      an input that is not in the form when it submits contributes no file. */}
                  <input
                    ref={(el) => { docInputs.current[kind] = el; }}
                    id={`doc-${kind.replace(/\s+/g, "-")}`}
                    type="file"
                    name={`doc:${kind}`}
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      const problem = f ? uploadProblem([f]) : null;
                      if (problem) {
                        setError(problem);
                        e.target.value = "";
                        setDocs((d) => { const next = { ...d }; delete next[kind]; return next; });
                        return;
                      }
                      setError(null);
                      setDocs((d) => {
                        const next = { ...d };
                        if (f) next[kind] = { name: f.name, size: fileSize(f.size) };
                        else delete next[kind];
                        return next;
                      });
                    }}
                  />
                  {docs[kind] ? (
                    <button
                      type="button"
                      onClick={() => {
                        const input = docInputs.current[kind];
                        if (input) input.value = "";
                        setDocs((d) => { const next = { ...d }; delete next[kind]; return next; });
                      }}
                      className="shrink-0 cursor-pointer rounded-[7px] border border-bad-100 bg-bad-050 px-[11px] py-[5px] text-[10.5px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
                    >
                      Remove
                    </button>
                  ) : (
                    <label
                      htmlFor={`doc-${kind.replace(/\s+/g, "-")}`}
                      className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 bg-white px-3 py-[5px] text-[10.5px] font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
                    >
                      {doc ? "↑ Replace" : "↑ Attach"}
                    </label>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Sticky action bar: stays in view while the long form scrolls. */}
        <div className="sticky bottom-0 z-10 -mx-[26px] -mb-5 mt-2 border-t border-line-400 bg-white/95 px-[26px] py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3">
            <p className="text-[11.5px] font-medium text-muted-500">
              <span className="text-bad-600">*</span> Mandatory fields
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={backHref}
                className="rounded-[9px] border border-line-400 bg-white px-4 py-2.5 text-[12.5px] font-bold text-navy-600 transition-colors hover:bg-surface-hover"
              >
                Cancel
              </Link>
              <Button type="submit" loading={busy} className="px-[18px]">{submitLabel}</Button>
            </div>
          </div>
        </div>
      </form>
    </DetailScreen>
  );
}
