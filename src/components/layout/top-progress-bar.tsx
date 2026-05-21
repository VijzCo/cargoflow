"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function TopProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or query changes, animate a quick progress bar.
  // Next.js doesn't expose navigation start/end events directly, so we trigger
  // on URL change and complete it shortly after.
  useEffect(() => {
    setVisible(true);
    setProgress(15);
    const t1 = setTimeout(() => setProgress(50), 80);
    const t2 = setTimeout(() => setProgress(85), 220);
    const t3 = setTimeout(() => setProgress(100), 400);
    const t4 = setTimeout(() => { setVisible(false); setProgress(0); }, 650);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [pathname, searchParams]);

  // Also intercept clicks on internal links — fires immediately on click,
  // before Next.js has even started navigating. This is what makes the UI feel snappy.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || target.target === "_blank") return;
      if (target.hasAttribute("download")) return;
      // External link — skip
      if (/^https?:\/\//i.test(href)) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
        } catch { return; }
      }
      setVisible(true);
      setProgress(20);
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 250ms ease" }}
      aria-hidden
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: "width 300ms ease",
          boxShadow: "0 0 10px var(--primary, #4f46e5), 0 0 5px var(--primary, #4f46e5)",
        }}
      />
    </div>
  );
}

export function TopProgressBar() {
  // useSearchParams must be inside a Suspense boundary in App Router
  return (
    <Suspense fallback={null}>
      <TopProgressBarInner />
    </Suspense>
  );
}
