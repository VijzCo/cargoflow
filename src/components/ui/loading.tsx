import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/format";

/**
 * Skeleton — a shimmering placeholder block.
 * Use to build loading layouts that match the page structure.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/**
 * PageLoader — full-page spinner with optional label.
 * Use when a skeleton is overkill or you don't know the layout.
 */
export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/**
 * InlineLoader — a compact spinner for inline use inside containers.
 */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

/**
 * Pre-built page skeleton: header + KPI tile row + table.
 * Matches the structure of most CargoFlow list/detail pages.
 */
export function ListPageSkeleton({ kpiCount = 4 }: { kpiCount?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${kpiCount}`}>
        {Array.from({ length: kpiCount }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-6 w-40" />
        <div className="space-y-1.5 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Simple table skeleton: header + N rows.
 */
export function TablePageSkeleton({ title = "Loading", rows = 8 }: { title?: string; rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-9 w-full max-w-md" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">{title}</p>
    </div>
  );
}
