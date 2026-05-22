"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SUPPORTED_LOCALES, LOCALE_COOKIE, type Locale } from "./request";

export async function setLocale(locale: Locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
  // Refresh every server-rendered page so labels reflect new locale immediately
  revalidatePath("/", "layout");
}
