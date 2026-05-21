"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertTriangle, Container as ContainerIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  autoAllocatePreview, autoAllocateCommit, type AllocationPlan,
} from "@/lib/utils/container-actions";

export function AutoAllocateDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"config" | "preview">("config");
  const [newContainerType, setNewContainerType] = useState<"20FT" | "40FT">("40FT");
  const [plan, setPlan] = useState<AllocationPlan | null>(null);
  const [running, startRun] = useTransition();
  const [committing, startCommit] = useTransition();

  function reset() {
    setStep("config");
    setPlan(null);
  }

  function generatePreview() {
    startRun(async () => {
      try {
        const result = await autoAllocatePreview({ newContainerType });
        setPlan(result);
        setStep("preview");
        if (result.totals.assigned === 0) {
          toast.info("No allocatable items found.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Allocation preview failed.");
      }
    });
  }

  function commitPlan() {
    if (!plan) return;
    startCommit(async () => {
      try {
        const res = await autoAllocateCommit({
          plan: { entries: plan.entries, newContainers: plan.newContainers },
          containerNumberPrefix: "CTR",
        });
        toast.success(`Allocated ${res.assigned} items into ${res.newContainers} new + existing containers.`);
        onOpenChange(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Allocation failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Auto-allocate
          </DialogTitle>
          <DialogDescription>
            Pack Completed items into containers automatically. Earliest delivery dates are prioritized.
          </DialogDescription>
        </DialogHeader>

        {step === "config" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New container type</Label>
              <Select value={newContainerType} onValueChange={(v) => setNewContainerType(v as "20FT" | "40FT")} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20FT">20FT (27 CBM)</SelectItem>
                  <SelectItem value="40FT">40FT (65 CBM)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Existing Open containers will be filled first. New containers are created with this type when needed.
              </p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">How it works</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                <li>Picks every Completed item with CBM declared and no container yet.</li>
                <li>Sorts by delivery date (earliest first), then by CBM (larger first within a date).</li>
                <li>Fills tightest-fitting Open container first; creates a new one when nothing fits.</li>
                <li>Skips items larger than a single container's capacity (you'll be notified).</li>
                <li>Nothing is committed until you click "Apply".</li>
              </ul>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
              <Button onClick={generatePreview} disabled={running}>
                {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Computing...</> : "Generate plan"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && plan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Items" value={String(plan.totals.items)} />
              <Stat label="Assigned" value={String(plan.totals.assigned)} tint="emerald" />
              <Stat label="New containers" value={String(plan.totals.createdContainers)} tint="indigo" />
              <Stat label="Skipped" value={String(plan.totals.skipped)} tint={plan.totals.skipped > 0 ? "rose" : undefined} />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total CBM allocated</span>
                <span className="font-mono">{plan.totals.cbm.toFixed(2)} CBM</span>
              </div>
            </div>

            {plan.totals.skipped > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-200">{plan.totals.skipped} item{plan.totals.skipped === 1 ? "" : "s"} skipped</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                      {plan.entries.filter((e) => e.kind === "skip").slice(0, 4).map((e, i) => (
                        <li key={i}>• {("reason" in e ? e.reason : "")}</li>
                      ))}
                      {plan.entries.filter((e) => e.kind === "skip").length > 4 && (
                        <li className="italic">+ more (apply will skip these; they stay Completed)</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {plan.newContainers.length > 0 && (
              <div className="rounded-md border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <ContainerIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">New containers to create</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.newContainers.map((nc, i) => (
                    <Badge key={i} variant="outline">{nc.type}</Badge>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("config")} disabled={committing}>Back</Button>
              <Button onClick={commitPlan} disabled={committing || plan.totals.assigned === 0}>
                {committing ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying...</> : `Apply (${plan.totals.assigned} items)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: "rose" | "emerald" | "indigo" }) {
  const cls =
    tint === "rose" ? "text-rose-600 dark:text-rose-400" :
    tint === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tint === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    "";
  return (
    <div className="rounded-md border p-3 text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
