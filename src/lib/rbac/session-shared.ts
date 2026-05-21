// Pure constants and types — safe to import from anywhere (client, server,
// edge middleware). No server-only dependencies.

import type { Role } from "@/types";

export const SESSION_COOKIE_NAME = "cargoflow_session";
export const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE ?? 432000); // 5 days

export interface SessionUser {
  uid: string;
  email: string;
  role: Role;
  active: boolean;
  supplierId?: string;
  displayName: string;
}
