"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      position="top-right"
      theme={(theme as "light" | "dark" | "system") ?? "system"}
      richColors
      closeButton
    />
  );
}
