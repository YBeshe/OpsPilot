import type { Metadata } from "next";
import Link from "next/link";

import { DashboardNav } from "@/components/dashboard-nav";

export const metadata: Metadata = {
  title: "Dashboard · OpsPilot",
};

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex w-full flex-col border-b border-slate-800 bg-slate-950/80 lg:w-56 lg:border-b-0 lg:border-r lg:sticky lg:top-0 lg:h-screen lg:self-start lg:gap-8 lg:px-4 lg:py-8">
        <div className="border-b border-slate-800 px-4 pb-6 pt-8 lg:border-0 lg:p-0">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400"
          >
            OpsPilot
          </Link>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            Dev preview — SSO and connectors ship in later milestones.
          </p>
        </div>
        <div className="px-4 py-4 lg:px-0">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Navigate
          </p>
          <DashboardNav />
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-4 backdrop-blur">
          <h1 className="text-lg font-semibold text-white">Operational hub</h1>
          <p className="text-sm text-slate-500">
            Release planning • calendar • validations • approvals
          </p>
        </header>
        <div className="flex-1 space-y-6 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
