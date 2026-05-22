"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions";

export function LanguageToggle() {
  const current = useLocale();
  const [pending, startTransition] = useTransition();

  function switchTo(locale: "en" | "zh") {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
    });
  }

  const label = current === "zh" ? "中文" : "EN";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2"
          disabled={pending}
          aria-label="Change language"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-medium">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => switchTo("en")} disabled={pending}>
          {current === "en" && <span className="mr-2">✓</span>}
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchTo("zh")} disabled={pending}>
          {current === "zh" && <span className="mr-2">✓</span>}
          中文
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
