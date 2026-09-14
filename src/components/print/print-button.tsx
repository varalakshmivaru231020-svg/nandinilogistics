"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog. Lives inside a `data-noprint` bar, so it never prints itself. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
