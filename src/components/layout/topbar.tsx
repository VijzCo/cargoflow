"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { LogOut, Moon, Sun, Bell, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { countPendingApprovalsForCurrentUser } from "@/lib/utils/edit-request-actions";
import type { SessionUser } from "@/lib/rbac/session-shared";

export function Topbar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const tTop = useTranslations("topbar");
  const tRoles = useTranslations("roles");
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Approver bell: poll every 60s; cheap call, capped at 100 docs
  useEffect(() => {
    let cancelled = false;
    function tick() {
      countPendingApprovalsForCurrentUser()
        .then((n) => { if (!cancelled) setPendingCount(n); })
        .catch(() => {});
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

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
        <LanguageToggle />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={tTop("themeToggle")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" aria-label="Pending approvals" className="relative" asChild>
          <Link href="/admin/approvals">
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none"
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </Badge>
            )}
          </Link>
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
                  {tRoles(user.role)}
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
              <LogOut className="mr-2 h-4 w-4" /> {tTop("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
