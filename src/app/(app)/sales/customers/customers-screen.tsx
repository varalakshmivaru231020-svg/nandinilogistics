"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, EmptyState, Field, Input, Textarea } from "@/components/ui/primitives";
import { formatDate, money } from "@/lib/utils";
import { createCustomerAction, verifyKycAction } from "../bookings/actions";

interface Customer {
  id: string; customerNo: string; name: string; phone: string; email: string | null;
  panNumber: string | null; addressLine: string | null;
  kycVerified: boolean; kycVerifiedAt: string | null;
  bookings: Array<{ id: string; bookingNo: string; status: string; unitNumber: string; totalAmount: number; receivedAmount: number }>;
}

export function CustomersScreen({
  customers, can,
}: { customers: Customer[]; can: Record<string, boolean> }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function verify(id: string) {
    setBusy(id);
    setError(null);
    const res = await verifyKycAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("KYC verified."); router.refresh(); }
  }

  const columns: Column<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (c) => (
        <div>
          <p className="text-sm font-medium text-navy-950">{c.name}</p>
          <p className="text-xs text-muted-500">{c.customerNo}</p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (c) => (
        <div className="text-xs">
          <p className="text-navy-600">{can.viewKyc ? c.phone : "••••••"}</p>
          {c.email && <p className="text-muted-400">{c.email}</p>}
        </div>
      ),
    },
    {
      key: "pan",
      header: "PAN",
      visible: can.viewKyc,
      render: (c) => <span className="text-xs text-muted-600">{c.panNumber ?? "—"}</span>,
    },
    {
      key: "bookings",
      header: "Units",
      render: (c) =>
        c.bookings.length === 0 ? (
          <span className="text-xs text-muted-400">No booking</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {c.bookings.map((b) => (
              <Link key={b.id} href={`/sales/bookings/${b.id}`}>
                <Badge tone={b.status === "CANCELLED" ? "bad" : "brand"}>{b.unitNumber}</Badge>
              </Link>
            ))}
          </div>
        ),
    },
    {
      key: "value",
      header: "Booked value",
      align: "right",
      className: "num",
      render: (c) => {
        const total = c.bookings
          .filter((b) => b.status !== "CANCELLED")
          .reduce((s, b) => s + b.totalAmount, 0);
        return total > 0 ? money(total) : <span className="text-muted-400">—</span>;
      },
    },
    {
      key: "kyc",
      header: "KYC",
      align: "center",
      render: (c) =>
        c.kycVerified ? (
          <Badge tone="good" title={formatDate(c.kycVerifiedAt)}>Verified</Badge>
        ) : (
          <Badge tone="warn">Pending</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      visible: can.verifyKyc,
      render: (c) =>
        c.kycVerified ? null : (
          <Button size="xs" variant="secondary" loading={busy === c.id} onClick={() => verify(c.id)}>
            <BadgeCheck className="h-3 w-3" />
            Verify KYC
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New customer
          </Button>
        </div>
      )}

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No customers yet"
            description="A customer record is created at booking, from the lead that produced it."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={customers} rowKey={(c) => c.id} dense />
      )}

      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); setNotice("Customer created."); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createCustomerAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New customer"
      description="PAN is required before KYC can be verified."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="customer-form" loading={busy}>Create customer</Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input name="name" required /></Field>
          <Field label="Phone" required><Input name="phone" type="tel" required /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="PAN"><Input name="panNumber" className="uppercase" placeholder="ABCDE1234F" /></Field>
          <Field label="Aadhaar"><Input name="aadhaarNumber" /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea name="addressLine" rows={2} /></Field>
        </div>
      </form>
    </Modal>
  );
}
