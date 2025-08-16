"use client";

import { usePathname } from "next/navigation";

function labelFromPath(path: string): string {
  const seg = path.replace(/\/+$/,'').split("/").filter(Boolean).pop() || "home";
  const map: Record<string,string> = {
    "": "Home",
    "ui": "Home",
    "v3": "Home",
    "dashboard": "Dashboard",
    "search": "Search",
    "health": "Health",
    "rules": "Rules",
    "alerts": "Alerts",
    "reports": "Reports",
    "settings": "Settings",
  };
  return map[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function Watermark() {
  const pathname = usePathname() || "/ui/v3";
  const page = labelFromPath(pathname);
  return (
    <div
      data-testid="ui-v3-watermark"
      aria-hidden
      className="fixed bottom-3 right-4 z-[9999] pointer-events-none select-none text-[11px] font-semibold px-2 py-1 rounded border border-black bg-black text-white shadow-md dark:bg-white dark:text-black"
      title={pathname}
    >
      UI-V3 View ({page}) • {pathname}
    </div>
  );
}
