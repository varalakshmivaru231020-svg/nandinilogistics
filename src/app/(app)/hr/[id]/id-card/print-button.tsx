"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button size="md" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
