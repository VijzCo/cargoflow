import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModulePlaceholder({
  title,
  description,
  comingIn,
}: {
  title: string;
  description: string;
  comingIn: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="h-5 w-5 text-amber-500" />
            Coming in {comingIn}
          </CardTitle>
          <CardDescription>
            The foundation has wired up routing, RBAC, and access control for this module.
            Functionality lands in the next iteration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is protected by both middleware (cookie check) and Firestore security rules
            (role + permission check). Only users with the right role see it in the sidebar.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
