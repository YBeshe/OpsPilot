"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNavItems } from "@/lib/nav/dashboard-nav";

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 text-sm">
      {dashboardNavItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isRoot = item.href === "/dashboard";
        const match = isRoot ? pathname === "/dashboard" : active;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={[
              "rounded-lg px-3 py-2 transition-colors",
              match
                ? "bg-sky-500/15 font-medium text-sky-300 ring-1 ring-sky-500/30"
                : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
