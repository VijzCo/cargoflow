import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getSettings } from "@/lib/utils/admin-actions";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "settings.view")) redirect("/dashboard");

  const settings = await getSettings();
  const canEdit = hasPermission(user.role, "settings.update");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Global system settings. Changes apply to all users.
        </p>
      </div>
      <SettingsForm initial={settings} canEdit={canEdit} />
    </div>
  );
}
