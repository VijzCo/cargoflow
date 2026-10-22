"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviseDatesDialog } from "./revise-dates-dialog";
import type { VesselStatus } from "@/types";

export function ReviseDatesButton({
  vessel,
}: {
  vessel: {
    id: string;
    vesselId: string;
    vesselName?: string;
    status: VesselStatus;
    etd?: string;
    eta?: string;
  };
}) {
  const [open, setOpen] = useState(false);

  // Hide button entirely when both fields are locked (Delivered)
  if (vessel.status === "Delivered") return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock className="h-4 w-4" />
        Revise ETD / ETA
      </Button>
      <ReviseDatesDialog open={open} onOpenChange={setOpen} vessel={vessel} />
    </>
  );
}
