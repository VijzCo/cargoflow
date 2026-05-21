"use client";

import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { hasPermission, hasAnyPermission, type Permission } from "@/lib/rbac/permissions";

export function useCan(perm: Permission): boolean {
  const { role } = useAuth();
  return hasPermission(role, perm);
}

export function useCanAny(perms: Permission[]): boolean {
  const { role } = useAuth();
  return hasAnyPermission(role, perms);
}

export function Can({
  permission,
  any,
  fallback = null,
  children,
}: {
  permission?: Permission;
  any?: Permission[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { role } = useAuth();
  const allowed = permission
    ? hasPermission(role, permission)
    : any
    ? hasAnyPermission(role, any)
    : false;
  return <>{allowed ? children : fallback}</>;
}
