"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Bell, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { ROLES } from "@/types";
import type { SessionUser } from "@/lib/rbac/session-shared";

export function Topbar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();

  async function handleSignOut() {
    try {
      await signOut();
      toast.success("Signed out");
      router.replace("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed.");
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-8">
      <div className="ml-12 lg:ml-0">
        {/* breadcrumbs / page title slot — pages can portal into here later */}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
          <Bell className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-navy to-brand-indigo text-xs font-semibold text-white">
                {user.displayName?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase()}
              </div>
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium leading-tight">{user.displayName || user.email}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {ROLES[user.role]?.label ?? user.role}
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-normal">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
