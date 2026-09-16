"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

/**
 * A "new record" button that opens the design's right-hand drawer over the
 * list it was pressed from.
 *
 * The form itself is passed in as `children` and is rendered by the server
 * page, so its lookups are fetched with the list rather than on a second
 * navigation — this component only decides whether the drawer is showing.
 * The full page at each module's /new route stays for direct links.
 */
export function NewRecordDrawer({
  label,
  title,
  description,
  size = "xl",
  children,
}: {
  label: string;
  title: string;
  description?: string;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Drawer open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        {children}
      </Drawer>
    </>
  );
}
