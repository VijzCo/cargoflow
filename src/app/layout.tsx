import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "@/i18n/request";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/toaster";
import { TopProgressBar } from "@/components/layout/top-progress-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CargoFlow — Consignment & Container Tracking",
  description:
    "Smart consignment, production tracking, and container planning for global sourcing.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <AuthProvider>
              <TopProgressBar />
              {children}
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
