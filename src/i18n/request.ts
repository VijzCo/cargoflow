import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_COOKIE = "cargoflow-locale";

/** Server-side helper to read the locale cookie. */
export async function getLocale(): Promise<Locale> {
  const c = cookies().get(LOCALE_COOKIE)?.value;
  if (c === "en" || c === "zh") return c;
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await getLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

export { LOCALE_COOKIE };
