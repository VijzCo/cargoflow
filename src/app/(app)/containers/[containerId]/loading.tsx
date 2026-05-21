import { Skeleton } from "@/components/ui/loading";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-32" />
      <Skeleton className="h-80" />
    </div>
  );
}
